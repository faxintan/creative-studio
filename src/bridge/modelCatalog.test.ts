import { describe, expect, it, vi } from "vitest";

import {
  ModelCatalogError,
  ModelCatalogProvider,
  parseModelCatalog,
  type ModelCatalogCommandResult,
} from "./modelCatalog.js";

const timestamp = "2026-09-16T00:00:00.000Z";

function commandResult(payload: unknown): ModelCatalogCommandResult {
  return {
    stdout: JSON.stringify(payload),
    stderr: "",
    exitCode: 0,
  };
}

describe("parseModelCatalog", () => {
  it("preserves reported load above 100 and missing load", () => {
    const snapshot = parseModelCatalog(JSON.stringify([
      {
        name: "GPT-6-Astra",
        _meta: { trae: { load: { percent: 223 } } },
      },
      {
        name: "DeepSeek-V4-Pro",
        _meta: { trae: {} },
      },
    ]), timestamp);

    expect(snapshot).toEqual({
      models: [
        { id: "GPT-6-Astra", label: "GPT-6-Astra", loadPercent: 223 },
        { id: "DeepSeek-V4-Pro", label: "DeepSeek-V4-Pro" },
      ],
      observedAt: timestamp,
      stale: false,
      defaultModelId: undefined,
    });
  });

  it("uses a valid configured model as the preferred default", () => {
    const snapshot = parseModelCatalog(
      JSON.stringify([{ name: "model-a" }, { name: "model-b" }]),
      timestamp,
      "model-b",
    );

    expect(snapshot.defaultModelId).toBe("model-b");
  });

  it("rejects malformed and empty catalogs", () => {
    expect(() => parseModelCatalog("{")).toThrow(/malformed/);
    expect(() => parseModelCatalog(JSON.stringify({ items: [] }))).toThrow(
      /unsupported shape/,
    );
    expect(() => parseModelCatalog(JSON.stringify([{ description: "missing name" }]))).toThrow(
      /no usable models/,
    );
  });
});

describe("ModelCatalogProvider", () => {
  it("uses a fresh cache and bypasses it on refresh", async () => {
    const runCommand = vi
      .fn<() => Promise<ModelCatalogCommandResult>>()
      .mockResolvedValueOnce(commandResult([{ name: "model-a" }]))
      .mockResolvedValueOnce(commandResult([{ name: "model-b" }]));
    const provider = new ModelCatalogProvider(runCommand, undefined, 60_000);

    expect((await provider.getSnapshot()).models[0]?.id).toBe("model-a");
    expect((await provider.getSnapshot()).models[0]?.id).toBe("model-a");
    expect(runCommand).toHaveBeenCalledTimes(1);

    expect((await provider.getSnapshot(true)).models[0]?.id).toBe("model-b");
    expect(runCommand).toHaveBeenCalledTimes(2);
  });

  it("shares concurrent catalog lookups", async () => {
    let resolveCommand!: (result: ModelCatalogCommandResult) => void;
    const runCommand = vi.fn(
      () =>
        new Promise<ModelCatalogCommandResult>((resolve) => {
          resolveCommand = resolve;
        }),
    );
    const provider = new ModelCatalogProvider(runCommand);

    const first = provider.getSnapshot();
    const second = provider.getSnapshot();
    resolveCommand(commandResult([{ name: "model-a" }]));

    await expect(first).resolves.toEqual(await second);
    expect(runCommand).toHaveBeenCalledTimes(1);
  });

  it("retains the last successful snapshot as stale after refresh failure", async () => {
    const runCommand = vi
      .fn<() => Promise<ModelCatalogCommandResult>>()
      .mockResolvedValueOnce(commandResult([{ name: "model-a" }]))
      .mockRejectedValueOnce(new Error("catalog unavailable"));
    const provider = new ModelCatalogProvider(runCommand);

    await provider.getSnapshot();

    await expect(provider.getSnapshot(true)).rejects.toMatchObject({
      message: "catalog unavailable",
      staleSnapshot: {
        models: [{ id: "model-a", label: "model-a" }],
        observedAt: expect.any(String),
        stale: true,
      },
    } satisfies Partial<ModelCatalogError>);
  });
});
