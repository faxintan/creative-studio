import { describe, expect, it } from "vitest";

import type { BridgeConfig } from "../config.js";
import { ExecTraeRuntimeAdapter } from "./ExecTraeRuntimeAdapter.js";

const config: BridgeConfig = {
  host: "127.0.0.1",
  port: 8787,
  workspaceRoot: "/workspace",
  allowedOrigins: new Set(),
  runtimePreference: "exec-json",
  traecliPath: "traecli",
  traePermissionMode: "default",
  traeSandboxMode: "workspace-write",
  traeModel: "configured-model",
  distDir: "/workspace/dist",
};

interface ArgsBuilder {
  buildArgs(runtimeSessionId: string | undefined, modelId: string): string[];
}

describe("ExecTraeRuntimeAdapter", () => {
  it("uses the immutable run model for a new exec request", () => {
    const adapter = new ExecTraeRuntimeAdapter(config) as unknown as ArgsBuilder;

    expect(adapter.buildArgs(undefined, "selected-model")).toEqual([
      "-C",
      "/workspace",
      "--sandbox",
      "workspace-write",
      "--model",
      "selected-model",
      "exec",
      "--json",
      "--permission-mode",
      "default",
      "-",
    ]);
  });

  it("keeps the selected model when resuming a runtime session", () => {
    const adapter = new ExecTraeRuntimeAdapter(config) as unknown as ArgsBuilder;

    expect(adapter.buildArgs("thread-1", "next-model")).toContain("next-model");
    expect(adapter.buildArgs("thread-1", "next-model")).toEqual(
      expect.arrayContaining(["resume", "thread-1"]),
    );
    expect(adapter.buildArgs("thread-1", "next-model")).not.toContain(
      "configured-model",
    );
  });
});
