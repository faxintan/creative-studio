import { randomUUID } from "node:crypto";

import type {
  MessageStatus,
  ModelAttribution,
  TranscriptMessage,
} from "../shared/protocol.js";

export interface ActiveRun {
  runId: string;
  assistantMessageId: string;
  model: ModelAttribution;
  status: Extract<MessageStatus, "submitting" | "queued" | "streaming">;
  controller: AbortController;
  completed: boolean;
}

export interface BridgeSession {
  id: string;
  runtimeSessionId?: string;
  history: TranscriptMessage[];
  activeRun?: ActiveRun;
}

export class BridgeSessionStore {
  private readonly sessions = new Map<string, BridgeSession>();

  getOrCreate(id?: string): BridgeSession {
    if (id) {
      const existing = this.sessions.get(id);
      if (existing) {
        return existing;
      }
    }

    const session: BridgeSession = {
      id: id || randomUUID(),
      history: [],
    };
    this.sessions.set(session.id, session);
    return session;
  }

  appendMessage(session: BridgeSession, message: TranscriptMessage): void {
    session.history.push(message);
  }

  updateMessage(
    session: BridgeSession,
    messageId: string,
    update: Partial<Pick<TranscriptMessage, "content" | "status" | "model" | "error">>,
  ): TranscriptMessage | undefined {
    const message = session.history.find((candidate) => candidate.id === messageId);
    if (!message) {
      return undefined;
    }

    Object.assign(message, update, {
      updatedAt: new Date().toISOString(),
    });
    return message;
  }
}
