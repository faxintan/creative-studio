import { spawn } from "node:child_process";
import { once } from "node:events";

import type { BridgeConfig } from "../config.js";
import { parseTraeJsonLine } from "./traeJson.js";
import { RuntimeError, type RuntimeAvailability, type RuntimeEventHandlers, type RuntimePromptRequest, type RuntimePromptResult, type TraeRuntimeAdapter } from "./types.js";

export class ExecTraeRuntimeAdapter implements TraeRuntimeAdapter {
  readonly kind = "exec-json" as const;

  private activeProcesses = new Map<string, ReturnType<typeof spawn>>();

  constructor(private readonly config: BridgeConfig) {}

  async checkAvailability(): Promise<RuntimeAvailability> {
    return new Promise((resolve) => {
      const child = spawn(this.config.traecliPath, ["--version"], {
        cwd: this.config.workspaceRoot,
        stdio: ["ignore", "ignore", "ignore"],
      });

      child.once("error", (error) => {
        resolve({
          available: false,
          kind: this.kind,
          message: error.message,
        });
      });

      child.once("exit", (code) => {
        resolve({
          available: code === 0,
          kind: this.kind,
          message:
            code === 0
              ? "`traecli` is available through exec JSON mode."
              : "`traecli --version` exited unsuccessfully.",
        });
      });
    });
  }

  async sendPrompt(
    request: RuntimePromptRequest,
    handlers: RuntimeEventHandlers,
  ): Promise<RuntimePromptResult> {
    const args = this.buildArgs(request.runtimeSessionId, request.modelId);
    const child = spawn(this.config.traecliPath, args, {
      cwd: this.config.workspaceRoot,
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });

    this.activeProcesses.set(request.runId, child);

    const prompt = this.buildPrompt(request);
    let stderr = "";
    let bufferedStdout = "";
    let lastSnapshot = "";
    let runtimeSessionId = request.runtimeSessionId;
    let resolvedModelId: string | undefined;
    let queued = false;

    const handleParsedEvent = (parsed: ReturnType<typeof parseTraeJsonLine>) => {
      if (!parsed) {
        return;
      }

      if (parsed.runtimeSessionId) {
        runtimeSessionId = parsed.runtimeSessionId;
        handlers.onRuntimeSession(parsed.runtimeSessionId);
      }

      if (parsed.resolvedModelId && parsed.resolvedModelId !== resolvedModelId) {
        resolvedModelId = parsed.resolvedModelId;
        handlers.onResolvedModel(parsed.resolvedModelId);
      }

      if (parsed.queued && !queued) {
        queued = true;
        handlers.onQueued();
      }

      if (parsed.error) {
        handlers.onDiagnostic?.(parsed.error);
      }

      if (parsed.delta) {
        handlers.onDelta(parsed.delta);
        lastSnapshot += parsed.delta;
      } else if (parsed.snapshot) {
        const delta = snapshotDelta(lastSnapshot, parsed.snapshot);
        if (delta) {
          handlers.onDelta(delta);
          lastSnapshot = parsed.snapshot;
        }
      }
    };

    const abort = () => {
      if (!child.killed) {
        child.kill("SIGTERM");
        setTimeout(() => {
          if (!child.killed) {
            child.kill("SIGKILL");
          }
        }, 1500).unref();
      }
    };

    request.signal.addEventListener("abort", abort, { once: true });

    const spawnError = once(child, "error").then(([error]) => {
      throw new RuntimeError(
        "runtime_unavailable",
        error instanceof Error ? error.message : "Unable to start TraeCode CLI.",
      );
    });

    child.stdin.end(prompt);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      bufferedStdout += chunk;
      const lines = bufferedStdout.split(/\r?\n/);
      bufferedStdout = lines.pop() ?? "";

      for (const line of lines) {
        handleParsedEvent(parseTraeJsonLine(line));
      }
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
      handlers.onDiagnostic?.(chunk.trim());
    });

    const [code, signal] = (await Promise.race([
      once(child, "exit"),
      spawnError,
    ])) as [number | null, NodeJS.Signals | null];

    request.signal.removeEventListener("abort", abort);
    this.activeProcesses.delete(request.runId);

    if (request.signal.aborted) {
      throw new RuntimeError("request_canceled", "The assistant response was canceled.");
    }

    if (bufferedStdout.trim()) {
      handleParsedEvent(parseTraeJsonLine(bufferedStdout));
    }

    if (code !== 0) {
      throw new RuntimeError(
        "runtime_failed",
        `TraeCode CLI exited with ${signal ?? `code ${code}`}.`,
        stderr.trim() || undefined,
      );
    }

    return {
      runtimeSessionId,
      resolvedModelId,
    };
  }

  async cancel(runId: string): Promise<void> {
    const child = this.activeProcesses.get(runId);
    if (child && !child.killed) {
      child.kill("SIGTERM");
    }
  }

  private buildArgs(runtimeSessionId: string | undefined, modelId: string): string[] {
    const globalArgs = ["-C", this.config.workspaceRoot, "--sandbox", this.config.traeSandboxMode];
    globalArgs.push("--model", modelId);
    const permissionArgs = this.config.traePermissionMode
      ? ["--permission-mode", this.config.traePermissionMode]
      : [];

    if (runtimeSessionId) {
      return [
        ...globalArgs,
        "exec",
        "resume",
        "--json",
        ...permissionArgs,
        runtimeSessionId,
        "-",
      ];
    }

    return [
      ...globalArgs,
      "exec",
      "--json",
      ...permissionArgs,
      "-",
    ];
  }

  private buildPrompt(request: RuntimePromptRequest): string {
    if (request.runtimeSessionId) {
      return request.prompt;
    }

    const priorMessages = request.history
      .filter((message) => message.content.trim())
      .slice(-12)
      .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
      .join("\n\n");

    if (!priorMessages) {
      return request.prompt;
    }

    return [
      "Continue this local AiChat conversation. Answer the current user message directly.",
      "",
      "Conversation context:",
      priorMessages,
      "",
      "Current user message:",
      request.prompt,
    ].join("\n");
  }
}

function snapshotDelta(previous: string, next: string): string {
  if (next.startsWith(previous)) {
    return next.slice(previous.length);
  }

  if (next === previous) {
    return "";
  }

  return next;
}
