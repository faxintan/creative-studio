import { describe, expect, it } from "vitest";

import { isBridgeCommand } from "./protocol.js";

describe("isBridgeCommand", () => {
  it("accepts model catalog commands", () => {
    expect(isBridgeCommand({ type: "get_models" })).toBe(true);
    expect(isBridgeCommand({ type: "refresh_models" })).toBe(true);
  });

  it("requires a non-empty model id for message submission", () => {
    expect(
      isBridgeCommand({
        type: "send_message",
        clientMessageId: "message-1",
        prompt: "Hello",
        modelId: "GPT-5.4",
      }),
    ).toBe(true);
    expect(
      isBridgeCommand({
        type: "send_message",
        clientMessageId: "message-1",
        prompt: "Hello",
      }),
    ).toBe(false);
    expect(
      isBridgeCommand({
        type: "send_message",
        clientMessageId: "message-1",
        prompt: "Hello",
        modelId: "   ",
      }),
    ).toBe(false);
  });

  it("rejects malformed cancellation and unknown commands", () => {
    expect(isBridgeCommand({ type: "cancel_response" })).toBe(false);
    expect(isBridgeCommand({ type: "unknown" })).toBe(false);
    expect(isBridgeCommand(null)).toBe(false);
  });
});
