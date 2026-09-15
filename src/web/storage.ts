import type { TranscriptMessage } from "../shared/protocol.js";

const SESSION_KEY = "creative-studio.ai-chat.session-id";
const TRANSCRIPT_KEY = "creative-studio.ai-chat.transcript";

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
  const raw = window.localStorage.getItem(TRANSCRIPT_KEY);
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

function isTranscriptMessage(value: unknown): value is TranscriptMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<TranscriptMessage>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.role === "string" &&
    typeof candidate.content === "string" &&
    typeof candidate.status === "string" &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.updatedAt === "string"
  );
}
