#!/usr/bin/env node

import { WebSocketServer } from "ws";

const port = Number.parseInt(process.env.FAKE_APP_SERVER_PORT ?? "9898", 10);
const server = new WebSocketServer({ host: "127.0.0.1", port });

server.on("connection", (socket) => {
  socket.on("message", (raw) => {
    const request = JSON.parse(raw.toString());
    const { id, method, params = {} } = request;

    if (method === "initialize") {
      respond(socket, id, {});
      return;
    }

    if (method === "thread/start") {
      respond(socket, id, {
        thread: { id: "fake-app-thread" },
        model: params.model,
      });
      return;
    }

    if (method === "thread/resume") {
      respond(socket, id, { thread: { id: params.threadId } });
      return;
    }

    if (method === "turn/start") {
      const turnId = `turn-${Date.now()}`;
      respond(socket, id, {
        turn: { id: turnId },
        model: params.model,
      });
      const base = { threadId: params.threadId, turnId, model: params.model };

      if (params.model === "Queued Model") {
        notify(socket, "turn/queued", {
          ...base,
          status: "queued_for_capacity",
        });
      }

      setTimeout(() => {
        const prompt = Array.isArray(params.input)
          ? params.input.map((item) => item?.text ?? "").join("")
          : "";
        notify(socket, "item/agentMessage/delta", {
          ...base,
          delta: `${params.model}: ${prompt}`,
        });
        notify(socket, "turn/completed", base);
      }, params.model === "Queued Model" ? 1200 : 20);
      return;
    }

    if (method === "turn/interrupt") {
      respond(socket, id, {});
      return;
    }

    socket.send(JSON.stringify({
      id,
      error: { message: `Unsupported method: ${method}` },
    }));
  });
});

console.log(`Fake app-server listening on ws://127.0.0.1:${port}`);

function respond(socket, id, result) {
  socket.send(JSON.stringify({ id, result }));
}

function notify(socket, method, params) {
  socket.send(JSON.stringify({ method, params }));
}

function shutdown() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
