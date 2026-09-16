import { beforeEach, describe, expect, it, vi } from "vitest";

const socketState = vi.hoisted(() => ({
  requests: [] as Array<{ method: string; params: Record<string, unknown> }>,
}));

vi.mock("ws", () => {
  class FakeWebSocket {
    private readonly listeners = new Map<string, Set<(...args: unknown[]) => void>>();

    constructor(_url: string) {
      queueMicrotask(() => this.emitEvent("open"));
    }

    on(event: string, listener: (...args: never[]) => void): this {
      const listeners = this.listeners.get(event) ?? new Set();
      listeners.add(listener as (...args: unknown[]) => void);
      this.listeners.set(event, listeners);
      return this;
    }

    once(event: string, listener: (...args: never[]) => void): this {
      const wrapped = (...args: unknown[]) => {
        this.listeners.get(event)?.delete(wrapped);
        listener(...(args as never[]));
      };
      return this.on(event, wrapped);
    }

    send(raw: string, callback: (error?: Error) => void): void {
      const request = JSON.parse(raw) as {
        id: number;
        method: string;
        params: Record<string, unknown>;
      };
      socketState.requests.push({
        method: request.method,
        params: request.params,
      });
      callback();

      const result =
        request.method === "thread/start"
          ? { thread: { id: "thread-1" }, model: request.params.model }
          : request.method === "turn/start"
            ? { turn: { id: "turn-1" }, model: request.params.model }
            : {};

      queueMicrotask(() => {
        this.emitEvent("message", JSON.stringify({ id: request.id, result }));
        if (request.method === "turn/start") {
          setTimeout(() => {
            const base = { threadId: "thread-1", turnId: "turn-1" };
            this.emitEvent("message", JSON.stringify({
              method: "turn/queued",
              params: base,
            }));
            this.emitEvent("message", JSON.stringify({
              method: "turn/queued",
              params: base,
            }));
            this.emitEvent("message", JSON.stringify({
              method: "item/agentMessage/delta",
              params: { ...base, delta: "Answer" },
            }));
            this.emitEvent("message", JSON.stringify({
              method: "turn/completed",
              params: base,
            }));
          }, 0);
        }
      });
    }

    close(): void {}

    private emitEvent(event: string, ...args: unknown[]): void {
      for (const listener of this.listeners.get(event) ?? []) {
        listener(...args);
      }
    }
  }

  return { default: FakeWebSocket };
});

import type { BridgeConfig } from "../config.js";
import { AppServerTraeRuntimeAdapter } from "./AppServerTraeRuntimeAdapter.js";

const config: BridgeConfig = {
  host: "127.0.0.1",
  port: 8787,
  workspaceRoot: "/workspace",
  allowedOrigins: new Set(),
  runtimePreference: "app-server",
  traecliPath: "traecli",
  traeSandboxMode: "workspace-write",
  traeModel: "configured-model",
  appServerWsUrl: "ws://127.0.0.1:9999",
  distDir: "/workspace/dist",
};

describe("AppServerTraeRuntimeAdapter", () => {
  beforeEach(() => {
    socketState.requests.length = 0;
  });

  it("uses the run model and deduplicates explicit queue notifications", async () => {
    const adapter = new AppServerTraeRuntimeAdapter(config);
    const queued = vi.fn();
    const onDelta = vi.fn();
    const onResolvedModel = vi.fn();

    const result = await adapter.sendPrompt(
      {
        bridgeSessionId: "bridge-1",
        runId: "run-1",
        prompt: "Hello",
        modelId: "selected-model",
        history: [],
        signal: new AbortController().signal,
      },
      {
        onDelta,
        onQueued: queued,
        onResolvedModel,
        onRuntimeSession: vi.fn(),
      },
    );

    const threadStart = socketState.requests.find(
      (request) => request.method === "thread/start",
    );
    const turnStart = socketState.requests.find(
      (request) => request.method === "turn/start",
    );
    expect(threadStart?.params.model).toBe("selected-model");
    expect(turnStart?.params.model).toBe("selected-model");
    expect(queued).toHaveBeenCalledTimes(1);
    expect(onDelta).toHaveBeenCalledWith("Answer");
    expect(onResolvedModel).toHaveBeenCalledWith("selected-model");
    expect(result).toEqual({
      runtimeSessionId: "thread-1",
      resolvedModelId: "selected-model",
    });
  });

  it("resumes the existing thread while applying a new turn model", async () => {
    const adapter = new AppServerTraeRuntimeAdapter(config);

    await adapter.sendPrompt(
      {
        bridgeSessionId: "bridge-1",
        runId: "run-2",
        prompt: "Follow up",
        modelId: "next-model",
        history: [],
        runtimeSessionId: "thread-1",
        signal: new AbortController().signal,
      },
      {
        onDelta: vi.fn(),
        onQueued: vi.fn(),
        onResolvedModel: vi.fn(),
        onRuntimeSession: vi.fn(),
      },
    );

    expect(socketState.requests.some((request) => request.method === "thread/start")).toBe(
      false,
    );
    expect(socketState.requests.some((request) => request.method === "thread/resume")).toBe(
      true,
    );
    expect(
      socketState.requests.find((request) => request.method === "turn/start")?.params
        .model,
    ).toBe("next-model");
  });
});
