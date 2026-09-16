import { describe, expect, it } from "vitest";

import {
  parseStoredTranscript,
  resolveSelectedModelId,
} from "./storage.js";

const timestamp = "2026-09-16T00:00:00.000Z";

describe("parseStoredTranscript", () => {
  it("keeps legacy messages without model attribution", () => {
    const messages = parseStoredTranscript(JSON.stringify([{
      id: "legacy",
      role: "assistant",
      content: "Existing answer",
      status: "complete",
      createdAt: timestamp,
      updatedAt: timestamp,
    }]));

    expect(messages).toHaveLength(1);
    expect(messages[0]?.model).toBeUndefined();
  });

  it("keeps model attribution and new active statuses", () => {
    const messages = parseStoredTranscript(JSON.stringify([{
      id: "queued",
      role: "assistant",
      content: "",
      status: "queued",
      createdAt: timestamp,
      updatedAt: timestamp,
      model: { id: "GPT-5.4", label: "GPT-5.4" },
    }]));

    expect(messages[0]).toMatchObject({
      status: "queued",
      model: { id: "GPT-5.4", label: "GPT-5.4" },
    });
  });

  it("drops malformed entries and invalid model attribution", () => {
    const messages = parseStoredTranscript(JSON.stringify([
      { id: "partial" },
      {
        id: "invalid-model",
        role: "assistant",
        content: "",
        status: "complete",
        createdAt: timestamp,
        updatedAt: timestamp,
        model: { id: "GPT-5.4" },
      },
    ]));

    expect(messages).toEqual([]);
  });
});

describe("resolveSelectedModelId", () => {
  const snapshot = {
    models: [
      { id: "model-a", label: "Model A" },
      { id: "model-b", label: "Model B", loadPercent: 140 },
    ],
    observedAt: timestamp,
    stale: false,
    defaultModelId: "model-b",
  };

  it("retains a stored selection that is still available", () => {
    expect(resolveSelectedModelId(snapshot, "model-a")).toBe("model-a");
  });

  it("falls back to the declared default for an unavailable selection", () => {
    expect(resolveSelectedModelId(snapshot, "removed-model")).toBe("model-b");
  });

  it("falls back to the first model when no default is available", () => {
    expect(
      resolveSelectedModelId({ ...snapshot, defaultModelId: undefined }, undefined),
    ).toBe("model-a");
  });

  it("returns undefined for an empty catalog", () => {
    expect(
      resolveSelectedModelId({ ...snapshot, models: [] }, "model-a"),
    ).toBeUndefined();
  });
});
