import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { URL } from "node:url";

import { WebSocketServer, type WebSocket } from "ws";

import {
  BRIDGE_PROTOCOL_VERSION,
  createMessage,
  isBridgeCommand,
  type BridgeCommand,
  type BridgeEvent,
  type ChatError,
  type TranscriptMessage,
} from "../shared/protocol.js";
import { isLocalRemoteAddress, loadBridgeConfig } from "./config.js";
import { createRuntimeAdapter } from "./runtime/createRuntimeAdapter.js";
import { RuntimeError, type TraeRuntimeAdapter } from "./runtime/types.js";
import { BridgeSessionStore, type BridgeSession } from "./sessionStore.js";

const config = loadBridgeConfig();
const sessions = new BridgeSessionStore();
const runtimeSelection = await createRuntimeAdapter(config);
const runtime = runtimeSelection.adapter;

const server = createServer((request, response) => {
  routeHttpRequest(request, response, runtime);
});
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  if (!canAcceptUpgrade(request)) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});

wss.on("connection", (socket, request) => {
  const url = new URL(request.url ?? "/ws", `http://${request.headers.host ?? "127.0.0.1"}`);
  const session = sessions.getOrCreate(url.searchParams.get("sessionId") ?? undefined);

  send(socket, {
    type: "connection_state",
    state: runtimeSelection.availability.available ? "connected" : "disconnected",
    bridgeSessionId: session.id,
    runtime: runtimeSelection.availability.available ? runtime.kind : "unavailable",
    message: runtimeSelection.fallbackReason ?? runtimeSelection.availability.message,
  });

  socket.on("message", (raw) => {
    void handleSocketMessage(socket, session, raw.toString(), runtime);
  });
});

server.listen(config.port, config.host, () => {
  const runtimeLine = runtimeSelection.availability.available
    ? runtime.kind
    : `unavailable (${runtimeSelection.availability.message})`;
  console.log(
    [
      `AiChat bridge listening on http://${config.host}:${config.port}`,
      `WebSocket endpoint ws://${config.host}:${config.port}/ws`,
      `Runtime adapter ${runtimeLine}`,
      `Protocol ${BRIDGE_PROTOCOL_VERSION}`,
    ].join("\n"),
  );
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function handleSocketMessage(
  socket: WebSocket,
  session: BridgeSession,
  raw: string,
  adapter: TraeRuntimeAdapter,
): Promise<void> {
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    sendRejected(socket, session.id, "invalid_command", "Command payload is not valid JSON.");
    return;
  }

  if (!isBridgeCommand(payload)) {
    sendRejected(socket, session.id, "invalid_command", "Command payload is not supported.");
    return;
  }

  if (payload.type === "ping") {
    send(socket, { type: "pong", bridgeSessionId: session.id });
    return;
  }

  if (payload.type === "cancel_response") {
    await cancelActiveRun(socket, session, payload.runId, adapter);
    return;
  }

  await handleSendMessage(socket, session, payload, adapter);
}

async function handleSendMessage(
  socket: WebSocket,
  session: BridgeSession,
  command: Extract<BridgeCommand, { type: "send_message" }>,
  adapter: TraeRuntimeAdapter,
): Promise<void> {
  const prompt = command.prompt.trim();
  if (!prompt) {
    sendRejected(socket, session.id, "invalid_command", "Message cannot be empty.");
    return;
  }

  if (session.activeRun && !session.activeRun.completed) {
    sendRejected(socket, session.id, "session_busy", "An assistant response is already running.");
    return;
  }

  if (!runtimeSelection.availability.available) {
    sendRejected(
      socket,
      session.id,
      "runtime_unavailable",
      runtimeSelection.availability.message,
    );
    return;
  }

  const userMessage = createMessage("user", prompt, "complete", command.clientMessageId);
  sessions.appendMessage(session, userMessage);
  send(socket, {
    type: "user_message_accepted",
    bridgeSessionId: session.id,
    clientMessageId: command.clientMessageId,
    message: userMessage,
  });

  const runId = randomUUID();
  const assistantMessage = createMessage("assistant", "", "streaming");
  sessions.appendMessage(session, assistantMessage);
  const controller = new AbortController();
  session.activeRun = {
    runId,
    assistantMessageId: assistantMessage.id,
    controller,
    completed: false,
  };

  send(socket, {
    type: "assistant_started",
    bridgeSessionId: session.id,
    runId,
    message: assistantMessage,
  });

  try {
    const result = await adapter.sendPrompt(
      {
        bridgeSessionId: session.id,
        runId,
        prompt,
        history: session.history,
        runtimeSessionId: session.runtimeSessionId,
        signal: controller.signal,
      },
      {
        onDelta: (delta) => {
          const current = sessions.updateMessage(session, assistantMessage.id, {
            content: `${getMessageContent(session, assistantMessage.id)}${delta}`,
            status: "streaming",
          });
          if (current && !controller.signal.aborted) {
            send(socket, {
              type: "assistant_delta",
              bridgeSessionId: session.id,
              runId,
              delta,
            });
          }
        },
        onRuntimeSession: (runtimeSessionId) => {
          session.runtimeSessionId = runtimeSessionId;
        },
        onDiagnostic: (message) => {
          if (message) {
            console.warn(`[traecli] ${message}`);
          }
        },
      },
    );

    if (result.runtimeSessionId) {
      session.runtimeSessionId = result.runtimeSessionId;
    }

    if (!controller.signal.aborted) {
      sessions.updateMessage(session, assistantMessage.id, {
        status: "complete",
      });
      send(socket, {
        type: "assistant_completed",
        bridgeSessionId: session.id,
        runId,
        runtimeSessionId: session.runtimeSessionId,
      });
    }
  } catch (error) {
    const chatError = normalizeError(error);
    const status = chatError.code === "request_canceled" ? "canceled" : "failed";
    sessions.updateMessage(session, assistantMessage.id, {
      status,
      error: chatError,
    });
    send(socket, {
      type: status === "canceled" ? "assistant_canceled" : "assistant_failed",
      bridgeSessionId: session.id,
      runId,
      ...(status === "failed" ? { error: chatError } : {}),
    } as BridgeEvent);
  } finally {
    if (session.activeRun?.runId === runId) {
      session.activeRun.completed = true;
      session.activeRun = undefined;
    }
  }
}

async function cancelActiveRun(
  socket: WebSocket,
  session: BridgeSession,
  runId: string,
  adapter: TraeRuntimeAdapter,
): Promise<void> {
  const active = session.activeRun;
  if (!active || active.runId !== runId) {
    sendRejected(socket, session.id, "invalid_command", "No matching active response exists.");
    return;
  }

  active.controller.abort();
  await adapter.cancel?.(runId);
  sessions.updateMessage(session, active.assistantMessageId, {
    status: "canceled",
    error: {
      code: "request_canceled",
      message: "The assistant response was canceled.",
    },
  });
  send(socket, {
    type: "assistant_canceled",
    bridgeSessionId: session.id,
    runId,
  });
}

function routeHttpRequest(
  request: IncomingMessage,
  response: ServerResponse,
  adapter: TraeRuntimeAdapter,
): void {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);

  if (!isLocalRemoteAddress(request.socket.remoteAddress)) {
    writeJson(response, 403, { ok: false, error: "local_requests_only" });
    return;
  }

  if (url.pathname === "/health") {
    writeJson(response, 200, {
      ok: true,
      protocol: BRIDGE_PROTOCOL_VERSION,
      runtime: adapter.kind,
      runtimeAvailable: runtimeSelection.availability.available,
      host: config.host,
      port: config.port,
    });
    return;
  }

  if (url.pathname === "/api/client-config") {
    writeJson(response, 200, {
      protocol: BRIDGE_PROTOCOL_VERSION,
      wsPath: "/ws",
      tokenRequired: Boolean(config.optionalToken),
    });
    return;
  }

  serveStaticAsset(url.pathname, response);
}

function serveStaticAsset(pathname: string, response: ServerResponse): void {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const absolutePath = resolve(config.distDir, `.${normalize(requestedPath)}`);
  if (!absolutePath.startsWith(config.distDir)) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    response
      .writeHead(404, { "content-type": "text/plain; charset=utf-8" })
      .end("Build the web app with `npm run build` or use `npm run dev:web`.");
    return;
  }

  response.writeHead(200, { "content-type": contentTypeFor(absolutePath) });
  createReadStream(absolutePath).pipe(response);
}

function canAcceptUpgrade(request: IncomingMessage): boolean {
  if (!isLocalRemoteAddress(request.socket.remoteAddress)) {
    return false;
  }

  const url = new URL(request.url ?? "/ws", `http://${request.headers.host ?? "127.0.0.1"}`);
  if (url.pathname !== "/ws") {
    return false;
  }

  if (config.optionalToken && url.searchParams.get("token") !== config.optionalToken) {
    return false;
  }

  const origin = request.headers.origin;
  if (!origin) {
    return true;
  }

  return config.allowedOrigins.has(origin);
}

function send(socket: WebSocket, event: BridgeEvent): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(event));
  }
}

function sendRejected(
  socket: WebSocket,
  bridgeSessionId: string | undefined,
  code: ChatError["code"],
  message: string,
): void {
  send(socket, {
    type: "command_rejected",
    bridgeSessionId,
    error: {
      code,
      message,
    },
  });
}

function writeJson(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(payload, null, 2));
}

function contentTypeFor(filePath: string): string {
  const extension = extname(filePath);
  if (extension === ".html") {
    return "text/html; charset=utf-8";
  }
  if (extension === ".js") {
    return "text/javascript; charset=utf-8";
  }
  if (extension === ".css") {
    return "text/css; charset=utf-8";
  }
  if (extension === ".svg") {
    return "image/svg+xml";
  }
  return "application/octet-stream";
}

function getMessageContent(session: BridgeSession, messageId: string): string {
  return session.history.find((message) => message.id === messageId)?.content ?? "";
}

function normalizeError(error: unknown): ChatError {
  if (error instanceof RuntimeError) {
    return {
      code: error.code,
      message: error.message,
      details: error.details,
    };
  }

  return {
    code: "runtime_failed",
    message: error instanceof Error ? error.message : "The runtime request failed.",
  };
}

function shutdown(): void {
  wss.close();
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 1500).unref();
}
