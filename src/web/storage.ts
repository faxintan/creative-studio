import type {
  ModelCatalogSnapshot,
  TranscriptMessage,
} from "../shared/protocol.js";

const SESSION_KEY = "creative-studio.ai-chat.session-id";
const TRANSCRIPT_KEY = "creative-studio.ai-chat.transcript";
const MODEL_KEY = "creative-studio.ai-chat.selected-model";

export function loadSessionId(): string {
  const existing = window.localStorage.getItem(SESSION_KEY);
  if (existing) {
    return existing;
  }

  const created = crypto.randomUUID();
  window.localStorage.setItem(SESSION_KEY, created);
  return created;
}

export function loadTranscript(): TranscriptMessage[] {
  return parseStoredTranscript(window.localStorage.getItem(TRANSCRIPT_KEY));
}

export function parseStoredTranscript(raw: string | null): TranscriptMessage[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isTranscriptMessage) : [];
  } catch {
    return [];
  }
}

export function saveTranscript(messages: TranscriptMessage[]): void {
  window.localStorage.setItem(TRANSCRIPT_KEY, JSON.stringify(messages));
}

export function clearTranscript(): void {
  window.localStorage.removeItem(TRANSCRIPT_KEY);
}

export function loadSelectedModelId(): string | undefined {
  return window.localStorage.getItem(MODEL_KEY) || undefined;
}

export function saveSelectedModelId(modelId: string): void {
  window.localStorage.setItem(MODEL_KEY, modelId);
}

export function resolveSelectedModelId(
  snapshot: ModelCatalogSnapshot,
  selectedModelId: string | undefined,
): string | undefined {
  if (selectedModelId && snapshot.models.some((model) => model.id === selectedModelId)) {
    return selectedModelId;
  }

  if (
    snapshot.defaultModelId &&
    snapshot.models.some((model) => model.id === snapshot.defaultModelId)
  ) {
    return snapshot.defaultModelId;
  }

  return snapshot.models[0]?.id;
}

function isTranscriptMessage(value: unknown): value is TranscriptMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<TranscriptMessage>;
  const validRoles = new Set(["user", "assistant", "system"]);
  const validStatuses = new Set([
    "idle",
    "submitting",
    "queued",
    "streaming",
    "complete",
    "failed",
    "canceled",
  ]);
  const validModel =
    candidate.model === undefined ||
    (typeof candidate.model === "object" &&
      candidate.model !== null &&
      typeof candidate.model.id === "string" &&
      typeof candidate.model.label === "string");
  return (
    typeof candidate.id === "string" &&
    typeof candidate.role === "string" &&
    validRoles.has(candidate.role) &&
    typeof candidate.content === "string" &&
    typeof candidate.status === "string" &&
    validStatuses.has(candidate.status) &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.updatedAt === "string" &&
    validModel
  );
}
