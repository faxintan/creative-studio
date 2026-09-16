import { spawn } from "node:child_process";

import {
  isRecord,
  type ModelCatalogSnapshot,
  type ModelSummary,
} from "../shared/protocol.js";
import type { BridgeConfig } from "./config.js";

const DEFAULT_CACHE_TTL_MS = 30_000;
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

export interface ModelCatalogCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export type ModelCatalogCommand = () => Promise<ModelCatalogCommandResult>;

export class ModelCatalogError extends Error {
  readonly staleSnapshot?: ModelCatalogSnapshot;

  constructor(message: string, staleSnapshot?: ModelCatalogSnapshot) {
    super(message);
    this.name = "ModelCatalogError";
    this.staleSnapshot = staleSnapshot;
  }
}

export class ModelCatalogProvider {
  private cached?: ModelCatalogSnapshot;
  private inFlight?: Promise<ModelCatalogSnapshot>;

  constructor(
    private readonly runCommand: ModelCatalogCommand,
    private readonly preferredModelId?: string,
    private readonly cacheTtlMs = DEFAULT_CACHE_TTL_MS,
  ) {}

  static fromConfig(config: BridgeConfig): ModelCatalogProvider {
    return new ModelCatalogProvider(
      () => runModelsCommand(config),
      config.traeModel,
    );
  }

  get lastSnapshot(): ModelCatalogSnapshot | undefined {
    return this.cached;
  }

  async getSnapshot(forceRefresh = false): Promise<ModelCatalogSnapshot> {
    if (!forceRefresh && this.cached && this.isFresh(this.cached)) {
      return this.cached;
    }

    if (this.inFlight) {
      return this.inFlight;
    }

    this.inFlight = this.loadSnapshot();
    try {
      return await this.inFlight;
    } finally {
      this.inFlight = undefined;
    }
  }

  private async loadSnapshot(): Promise<ModelCatalogSnapshot> {
    try {
      const result = await this.runCommand();
      const snapshot = parseModelCatalog(
        result.stdout,
        new Date().toISOString(),
        this.preferredModelId,
      );
      this.cached = snapshot;
      return snapshot;
    } catch (error) {
      const staleSnapshot = this.cached
        ? { ...this.cached, stale: true }
        : undefined;
      throw new ModelCatalogError(
        error instanceof Error ? error.message : "Unable to load model catalog.",
        staleSnapshot,
      );
    }
  }

  private isFresh(snapshot: ModelCatalogSnapshot): boolean {
    const observedAt = Date.parse(snapshot.observedAt);
    return Number.isFinite(observedAt) && Date.now() - observedAt < this.cacheTtlMs;
  }
}

export function parseModelCatalog(
  raw: string,
  observedAt = new Date().toISOString(),
  preferredModelId?: string,
): ModelCatalogSnapshot {
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error("TraeCode CLI returned malformed model catalog JSON.");
  }

  const entries = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.models)
      ? payload.models
      : undefined;
  if (!entries) {
    throw new Error("TraeCode CLI model catalog has an unsupported shape.");
  }

  const models = entries.flatMap(parseModel);
  if (models.length === 0) {
    throw new Error("TraeCode CLI returned no usable models.");
  }

  const declaredDefault = findDeclaredDefault(payload, entries);
  const defaultModelId = [preferredModelId, declaredDefault].find(
    (candidate): candidate is string =>
      Boolean(candidate && models.some((model) => model.id === candidate)),
  );

  return {
    models,
    observedAt,
    stale: false,
    defaultModelId,
  };
}

function parseModel(value: unknown): ModelSummary[] {
  if (!isRecord(value) || typeof value.name !== "string" || !value.name.trim()) {
    return [];
  }

  const id = value.name.trim();
  const label =
    typeof value.display_name === "string" && value.display_name.trim()
      ? value.display_name.trim()
      : id;
  const loadPercent = readLoadPercent(value);

  return [{
    id,
    label,
    ...(loadPercent === undefined ? {} : { loadPercent }),
  }];
}

function readLoadPercent(model: Record<string, unknown>): number | undefined {
  const meta = isRecord(model._meta) ? model._meta : undefined;
  const trae = meta && isRecord(meta.trae) ? meta.trae : undefined;
  const load = trae && isRecord(trae.load) ? trae.load : undefined;
  const percent = load?.percent;
  return typeof percent === "number" && Number.isFinite(percent)
    ? percent
    : undefined;
}

function findDeclaredDefault(payload: unknown, entries: unknown[]): string | undefined {
  if (isRecord(payload)) {
    const candidate = payload.default_model ?? payload.defaultModel;
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  for (const entry of entries) {
    if (
      isRecord(entry) &&
      (entry.default === true || entry.is_default === true) &&
      typeof entry.name === "string"
    ) {
      return entry.name;
    }
  }

  return undefined;
}

async function runModelsCommand(
  config: BridgeConfig,
): Promise<ModelCatalogCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(config.traecliPath, ["models", "--json"], {
      cwd: config.workspaceRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      settleError(new Error("Timed out loading the TraeCode CLI model catalog."));
    }, DEFAULT_TIMEOUT_MS);

    const settleError = (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      reject(error);
    };

    child.once("error", (error) => settleError(error));
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      if (stdout.length > MAX_OUTPUT_BYTES) {
        child.kill("SIGTERM");
        settleError(new Error("TraeCode CLI model catalog exceeded the output limit."));
      }
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("close", (exitCode) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);

      if (!stdout.trim()) {
        reject(
          new Error(
            stderr.trim() ||
              `TraeCode CLI model catalog exited with code ${exitCode ?? "unknown"}.`,
          ),
        );
        return;
      }

      resolve({ stdout, stderr, exitCode });
    });
  });
}
