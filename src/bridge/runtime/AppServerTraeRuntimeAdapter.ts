import WebSocket from "ws";

import { isRecord } from "../../shared/protocol.js";
import type { BridgeConfig } from "../config.js";
import {
  findStringByKeys,
  isExplicitCapacityQueueEvent,
} from "./traeJson.js";
import {
  RuntimeError,
  type RuntimeAvailability,
  type RuntimeEventHandlers,
  type RuntimePromptRequest,
  type RuntimePromptResult,
  type TraeRuntimeAdapter,
} from "./types.js";

type JsonRpcId = string | number;

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
}

export class AppServerTraeRuntimeAdapter implements TraeRuntimeAdapter {
  readonly kind = "app-server" as const;

  constructor(private readonly config: BridgeConfig) {}

  async checkAvailability(): Promise<RuntimeAvailability> {
    if (!this.config.appServerWsUrl) {
      return {
        available: false,
        kind: this.kind,
        message: "Set AICHAT_TRAE_APP_SERVER_WS to enable app-server probing.",
      };
    }

    try {
      const client = await AppServerJsonRpcClient.connect(this.config.appServerWsUrl, 1500);
      try {
        await client.request("initialize", {
          clientInfo: {
            name: "creative-studio-ai-chat",
            title: "Creative Studio AiChat",
            version: "0.1.0",
          },
          capabilities: {
            experimentalApi: true,
          },
        });
      } finally {
        client.close();
      }

      return {
        available: true,
        kind: this.kind,
        message: "Connected to TraeCode app-server WebSocket.",
      };
    } catch (error) {
      return {
        available: false,
        kind: this.kind,
        message: error instanceof Error ? error.message : "Unable to probe app-server.",
      };
    }
  }

  async sendPrompt(
    request: RuntimePromptRequest,
    handlers: RuntimeEventHandlers,
  ): Promise<RuntimePromptResult> {
    if (!this.config.appServerWsUrl) {
      throw new RuntimeError(
        "runtime_unavailable",
        "AICHAT_TRAE_APP_SERVER_WS is not configured.",
      );
    }

    const client = await AppServerJsonRpcClient.connect(this.config.appServerWsUrl, 5000);
    let threadId = request.runtimeSessionId;
    let turnId: string | undefined;
    let queued = false;
    let resolvedModelId: string | undefined;

    const onQueued = () => {
      if (!queued) {
        queued = true;
        handlers.onQueued();
      }
    };
    const onResolvedModel = (value: unknown) => {
      const modelId = findStringByKeys(value, [
        "model_id",
        "modelId",
        "model_name",
        "modelName",
        "model",
      ]);
      if (modelId && modelId !== resolvedModelId) {
        resolvedModelId = modelId;
        handlers.onResolvedModel(modelId);
      }
    };

    const abort = () => {
      if (threadId && turnId) {
        void client.request("turn/interrupt", { threadId, turnId }).catch(() => undefined);
      }
      client.close();
    };

    request.signal.addEventListener("abort", abort, { once: true });

    try {
      await client.request("initialize", {
        clientInfo: {
          name: "creative-studio-ai-chat",
          title: "Creative Studio AiChat",
          version: "0.1.0",
        },
        capabilities: {
          experimentalApi: true,
        },
      });

      if (!threadId) {
        const started = await client.request("thread/start", {
          cwd: this.config.workspaceRoot,
          sandbox: this.config.traeSandboxMode,
          model: request.modelId,
          threadSource: "custom",
          historyMode: "persisted",
        });
        onResolvedModel(started);
        threadId = extractThreadId(started);
        if (!threadId) {
          throw new RuntimeError(
            "runtime_failed",
            "App-server did not return a thread id.",
          );
        }
        handlers.onRuntimeSession(threadId);
      } else {
        await client.request("thread/resume", {
          threadId,
          initialTurnsPage: null,
        });
        handlers.onRuntimeSession(threadId);
      }

      const turnStarted = await client.request("turn/start", {
        threadId,
        cwd: this.config.workspaceRoot,
        input: [
          {
            type: "text",
            text: request.prompt,
          },
        ],
        sandboxPolicy: this.config.traeSandboxMode,
        model: request.modelId,
      });
      onResolvedModel(turnStarted);
      turnId = extractTurnId(turnStarted);

      await client.waitForTurn({
        threadId,
        turnId,
        signal: request.signal,
        onDelta: handlers.onDelta,
        onQueued,
        onResolvedModel,
        onError: (message) => {
          handlers.onDiagnostic?.(message);
        },
      });

      return {
        runtimeSessionId: threadId,
        resolvedModelId,
      };
    } catch (error) {
      if (request.signal.aborted) {
        throw new RuntimeError("request_canceled", "The assistant response was canceled.");
      }
      if (error instanceof RuntimeError) {
        throw error;
      }
      throw new RuntimeError(
        "runtime_failed",
        error instanceof Error ? error.message : "App-server request failed.",
      );
    } finally {
      request.signal.removeEventListener("abort", abort);
      client.close();
    }
  }
}

class AppServerJsonRpcClient {
  private nextId = 1;
  private readonly pending = new Map<JsonRpcId, PendingRequest>();
  private readonly listeners = new Set<(message: Record<string, unknown>) => void>();

  private constructor(private readonly socket: WebSocket) {
    socket.on("message", (data) => this.handleMessage(data.toString()));
    socket.on("close", () => this.rejectAll(new Error("App-server WebSocket closed.")));
    socket.on("error", (error) => this.rejectAll(error));
  }

  static connect(url: string, timeoutMs: number): Promise<AppServerJsonRpcClient> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      const timeout = setTimeout(() => {
        socket.close();
        reject(new Error(`Timed out connecting to ${url}.`));
      }, timeoutMs);

      socket.once("open", () => {
        clearTimeout(timeout);
        resolve(new AppServerJsonRpcClient(socket));
      });
      socket.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    const message = JSON.stringify({ id, method, params });

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(message, (error) => {
        if (error) {
          this.pending.delete(id);
          reject(error);
        }
      });
    });
  }

  async waitForTurn(args: {
    threadId: string;
    turnId?: string;
    signal: AbortSignal;
    onDelta(delta: string): void;
    onQueued(): void;
    onResolvedModel(value: unknown): void;
    onError(message: string): void;
  }): Promise<void> {
    return new Promise((resolve, reject) => {
      const onNotification = (message: Record<string, unknown>) => {
        const method = typeof message.method === "string" ? message.method : "";
        const params = isRecord(message.params) ? message.params : {};
        const threadId = typeof params.threadId === "string" ? params.threadId : undefined;
        const turnId =
          typeof params.turnId === "string"
            ? params.turnId
            : extractTurnIdFromParams(params);

        if (threadId && threadId !== args.threadId) {
          return;
        }
        if (args.turnId && turnId && turnId !== args.turnId) {
          return;
        }

        args.onResolvedModel(params);

        if (isExplicitCapacityQueueEvent(message)) {
          args.onQueued();
          return;
        }

        if (method === "item/agentMessage/delta") {
          const delta = typeof params.delta === "string" ? params.delta : "";
          if (delta) {
            args.onDelta(delta);
          }
          return;
        }

        if (method === "turn/completed") {
          cleanup();
          resolve();
          return;
        }

        if (method === "turn/failed" || method === "error") {
          const messageText = extractErrorMessage(params);
          args.onError(messageText);
          cleanup();
          reject(new Error(messageText));
        }
      };

      const onAbort = () => {
        cleanup();
        reject(new RuntimeError("request_canceled", "The assistant response was canceled."));
      };

      const cleanup = () => {
        this.listeners.delete(onNotification);
        args.signal.removeEventListener("abort", onAbort);
      };

      this.listeners.add(onNotification);
      args.signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  close(): void {
    this.socket.close();
  }

  private handleMessage(raw: string): void {
    let message: unknown;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }

    if (!isRecord(message)) {
      return;
    }

    if ("id" in message && ("result" in message || "error" in message)) {
      const id = message.id as JsonRpcId;
      const pending = this.pending.get(id);
      if (!pending) {
        return;
      }
      this.pending.delete(id);

      if (isRecord(message.error)) {
        pending.reject(new Error(extractErrorMessage(message.error)));
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    for (const listener of this.listeners) {
      listener(message);
    }
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }
}

function extractThreadId(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const thread = value.thread;
  if (isRecord(thread) && typeof thread.id === "string") {
    return thread.id;
  }

  return typeof value.threadId === "string" ? value.threadId : undefined;
}

function extractTurnId(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const turn = value.turn;
  if (isRecord(turn) && typeof turn.id === "string") {
    return turn.id;
  }

  return typeof value.turnId === "string" ? value.turnId : undefined;
}

function extractTurnIdFromParams(params: Record<string, unknown>): string | undefined {
  const turn = params.turn;
  if (isRecord(turn) && typeof turn.id === "string") {
    return turn.id;
  }
  return typeof params.turnId === "string" ? params.turnId : undefined;
}

function extractErrorMessage(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (!isRecord(value)) {
    return "App-server request failed.";
  }
  if (typeof value.message === "string") {
    return value.message;
  }
  if (isRecord(value.error) && typeof value.error.message === "string") {
    return value.error.message;
  }
  return JSON.stringify(value);
}
