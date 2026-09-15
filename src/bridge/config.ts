import path from "node:path";

import type { RuntimeKind } from "../shared/protocol.js";

export interface BridgeConfig {
  host: string;
  port: number;
  workspaceRoot: string;
  allowedOrigins: Set<string>;
  optionalToken?: string;
  runtimePreference: RuntimeKind | "auto";
  traecliPath: string;
  traePermissionMode?: string;
  traeSandboxMode: string;
  traeModel?: string;
  appServerWsUrl?: string;
  distDir: string;
}

export function loadBridgeConfig(): BridgeConfig {
  const host = process.env.AICHAT_HOST ?? "127.0.0.1";
  const port = parseInteger(process.env.AICHAT_PORT, 8787);
  const workspaceRoot = path.resolve(process.env.AICHAT_WORKSPACE_ROOT ?? process.cwd());
  const distDir = path.resolve(process.env.AICHAT_DIST_DIR ?? "dist");
  const ownOrigins = [
    `http://${host}:${port}`,
    `http://localhost:${port}`,
    "http://127.0.0.1:5173",
    "http://localhost:5173",
  ];

  return {
    host,
    port,
    workspaceRoot,
    distDir,
    allowedOrigins: new Set([
      ...ownOrigins,
      ...splitList(process.env.AICHAT_ALLOWED_ORIGINS),
    ]),
    optionalToken: process.env.AICHAT_BRIDGE_TOKEN,
    runtimePreference: parseRuntimePreference(process.env.AICHAT_RUNTIME),
    traecliPath: process.env.TRAECLI_PATH ?? "traecli",
    traePermissionMode: process.env.TRAECLI_PERMISSION_MODE,
    traeSandboxMode: process.env.TRAECLI_SANDBOX_MODE ?? "read-only",
    traeModel: process.env.TRAECLI_MODEL,
    appServerWsUrl: process.env.AICHAT_TRAE_APP_SERVER_WS,
  };
}

export function isLocalRemoteAddress(address: string | undefined): boolean {
  if (!address) {
    return false;
  }

  return (
    address === "127.0.0.1" ||
    address === "::1" ||
    address === "::ffff:127.0.0.1"
  );
}

function parseInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function splitList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseRuntimePreference(value: string | undefined): BridgeConfig["runtimePreference"] {
  if (value === "app-server" || value === "exec-json" || value === "unavailable") {
    return value;
  }

  return "auto";
}
