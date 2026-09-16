import { isRecord } from "../../shared/protocol.js";

export interface ParsedTraeJsonEvent {
  delta?: string;
  snapshot?: string;
  runtimeSessionId?: string;
  resolvedModelId?: string;
  queued?: boolean;
  completed?: boolean;
  error?: string;
}

const SESSION_KEYS = [
  "session_id",
  "sessionId",
  "conversation_id",
  "conversationId",
  "thread_id",
  "threadId",
];

const DELTA_KEYS = [
  "delta",
  "text_delta",
  "textDelta",
  "content_delta",
  "contentDelta",
];

const SNAPSHOT_KEYS = ["message", "content", "text", "output_text", "outputText"];
const MODEL_KEYS = ["model_id", "modelId", "model_name", "modelName", "model"];
const QUEUE_STATE_KEYS = ["status", "state", "phase", "queue_status", "queueStatus"];
const QUEUE_STATES = new Set([
  "queued",
  "queued for capacity",
  "queued_for_capacity",
  "waiting for capacity",
  "waiting_for_capacity",
]);

export function parseTraeJsonLine(line: string): ParsedTraeJsonEvent | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(trimmed);
  } catch {
    return {
      delta: `${line}\n`,
    };
  }

  if (!isRecord(payload)) {
    return null;
  }

  const type = getString(payload, "type") ?? getString(payload, "method") ?? "";
  const event: ParsedTraeJsonEvent = {};
  const runtimeSessionId = findStringByKeys(payload, SESSION_KEYS);
  if (runtimeSessionId) {
    event.runtimeSessionId = runtimeSessionId;
  }
  const resolvedModelId = findStringByKeys(payload, MODEL_KEYS);
  if (resolvedModelId) {
    event.resolvedModelId = resolvedModelId;
  }
  if (isExplicitCapacityQueueEvent(payload)) {
    event.queued = true;
  }

  const lowerType = type.toLowerCase();
  if (lowerType.includes("error") || lowerType.includes("failed")) {
    const errorText = extractErrorText(payload);
    if (errorText) {
      event.error = errorText;
    }
  }

  const delta = findStringByKeys(payload, DELTA_KEYS);
  if (delta) {
    event.delta = delta;
  } else {
    const snapshot = extractAssistantSnapshot(payload);
    if (snapshot) {
      event.snapshot = snapshot;
    }
  }

  if (
    lowerType.includes("completed") ||
    lowerType.includes("complete") ||
    lowerType === "done" ||
    lowerType === "turn.completed" ||
    lowerType === "response.completed"
  ) {
    event.completed = true;
  }

  return Object.keys(event).length > 0 ? event : null;
}

export function isExplicitCapacityQueueEvent(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  const eventName = [
    getString(value, "type"),
    getString(value, "method"),
    getString(value, "event"),
  ].find((candidate) => candidate && isQueueState(candidate));
  if (eventName) {
    return true;
  }

  for (const key of QUEUE_STATE_KEYS) {
    const candidate = value[key];
    if (typeof candidate === "string" && isQueueState(candidate)) {
      return true;
    }
  }

  const message = getString(value, "message");
  if (message && isQueueState(message)) {
    return true;
  }

  for (const key of ["params", "payload", "data"]) {
    if (isExplicitCapacityQueueEvent(value[key])) {
      return true;
    }
  }

  return false;
}

export function findStringByKeys(
  value: unknown,
  keys: readonly string[],
): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  for (const key of keys) {
    const direct = value[key];
    if (typeof direct === "string" && direct.trim()) {
      return direct;
    }
  }

  for (const nested of Object.values(value)) {
    if (isRecord(nested) || Array.isArray(nested)) {
      const found = findStringDeep(nested, keys, 0);
      if (found) {
        return found;
      }
    }
  }

  return undefined;
}

function findStringDeep(
  value: unknown,
  keys: readonly string[],
  depth: number,
): string | undefined {
  if (depth > 8) {
    return undefined;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findStringDeep(item, keys, depth + 1);
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  for (const key of keys) {
    const direct = value[key];
    if (typeof direct === "string" && direct.trim()) {
      return direct;
    }
  }

  for (const nested of Object.values(value)) {
    const found = findStringDeep(nested, keys, depth + 1);
    if (found) {
      return found;
    }
  }

  return undefined;
}

function extractAssistantSnapshot(payload: Record<string, unknown>): string | undefined {
  const type = getString(payload, "type")?.toLowerCase() ?? "";
  const role = getString(payload, "role")?.toLowerCase();
  const item = payload.item;
  const message = payload.message;

  if (isAssistantMessage(type, role)) {
    const direct = findStringByKeys(payload, SNAPSHOT_KEYS);
    if (direct) {
      return direct;
    }
  }

  if (isRecord(item)) {
    const itemType = getString(item, "type")?.toLowerCase() ?? "";
    const itemRole = getString(item, "role")?.toLowerCase();
    if (isAssistantMessage(itemType, itemRole)) {
      return extractContent(item);
    }
  }

  if (isRecord(message) && getString(message, "role")?.toLowerCase() === "assistant") {
    return extractContent(message);
  }

  return undefined;
}

function isAssistantMessage(type: string, role: string | undefined): boolean {
  return role === "assistant" || type.includes("assistant") || type === "agent_message";
}

function extractContent(value: Record<string, unknown>): string | undefined {
  for (const key of SNAPSHOT_KEYS) {
    const direct = value[key];
    if (typeof direct === "string" && direct.trim()) {
      return direct;
    }
  }

  const content = value.content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (isRecord(item)) {
          return (
            getString(item, "text") ??
            getString(item, "content") ??
            getString(item, "message") ??
            ""
          );
        }
        return "";
      })
      .join("")
      .trim();
  }

  return undefined;
}

function extractErrorText(payload: Record<string, unknown>): string | undefined {
  const error = payload.error;
  if (typeof error === "string") {
    return error;
  }
  if (isRecord(error)) {
    return (
      getString(error, "message") ??
      getString(error, "details") ??
      JSON.stringify(error)
    );
  }

  return getString(payload, "message") ?? getString(payload, "details");
}

function getString(value: Record<string, unknown>, key: string): string | undefined {
  const candidate = value[key];
  return typeof candidate === "string" ? candidate : undefined;
}

function isQueueState(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (QUEUE_STATES.has(normalized)) {
    return true;
  }

  const eventSegment = normalized.split(/[./:]/).at(-1);
  return eventSegment === "queued" || eventSegment === "waiting_for_capacity";
}
