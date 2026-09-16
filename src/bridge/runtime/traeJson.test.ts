import { describe, expect, it } from "vitest";

import {
  isExplicitCapacityQueueEvent,
  parseTraeJsonLine,
} from "./traeJson.js";

describe("parseTraeJsonLine", () => {
  it("normalizes delta, runtime session, resolved model, and queue state", () => {
    expect(
      parseTraeJsonLine(JSON.stringify({
        type: "turn/queued",
        threadId: "thread-1",
        modelId: "GPT-5.4",
        delta: "Hello",
      })),
    ).toEqual({
      runtimeSessionId: "thread-1",
      resolvedModelId: "GPT-5.4",
      queued: true,
      delta: "Hello",
    });
  });

  it("keeps non-JSON output as a text delta", () => {
    expect(parseTraeJsonLine("plain output")).toEqual({
      delta: "plain output\n",
    });
  });

  it("extracts assistant snapshots without exposing unrelated payloads", () => {
    expect(
      parseTraeJsonLine(JSON.stringify({
        type: "agent_message",
        role: "assistant",
        content: [{ type: "text", text: "Answer" }],
      })),
    ).toMatchObject({ snapshot: "Answer" });
    expect(parseTraeJsonLine(JSON.stringify({ type: "usage", tokens: 42 }))).toBeNull();
  });
});

describe("isExplicitCapacityQueueEvent", () => {
  it.each([
    { type: "turn/queued" },
    { status: "waiting_for_capacity" },
    { params: { phase: "Queued for capacity" } },
    { payload: { queueStatus: "queued_for_capacity" } },
  ])("accepts explicit queue signal %#", (payload) => {
    expect(isExplicitCapacityQueueEvent(payload)).toBe(true);
  });

  it.each([
    { _meta: { trae: { load: { percent: 223 } } } },
    { queue_size: 12 },
    { status: "running", queue_size: 12 },
    { message: "The queue may be busy" },
  ])("does not infer queue state from telemetry %#", (payload) => {
    expect(isExplicitCapacityQueueEvent(payload)).toBe(false);
  });
});
