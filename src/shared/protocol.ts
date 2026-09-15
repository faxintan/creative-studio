export const BRIDGE_PROTOCOL_VERSION = "2026-09-15.ai-chat-web.v1";

export type RuntimeKind = "app-server" | "exec-json" | "unavailable";

export type ConnectionState = "connecting" | "connected" | "disconnected";

export type MessageRole = "user" | "assistant" | "system";

export type MessageStatus =
  | "idle"
  | "streaming"
  | "complete"
  | "failed"
  | "canceled";

export interface TranscriptMessage {
  id: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  createdAt: string;
  updatedAt: string;
  error?: ChatError;
}

export interface ChatError {
  code:
    | "bridge_unavailable"
    | "runtime_unavailable"
    | "runtime_failed"
    | "invalid_command"
    | "request_canceled"
    | "session_busy";
  message: string;
  details?: string;
}

export interface SendMessageCommand {
  type: "send_message";
  clientMessageId: string;
  bridgeSessionId?: string;
  prompt: string;
}

export interface CancelResponseCommand {
  type: "cancel_response";
  bridgeSessionId?: string;
  runId: string;
}

export interface PingCommand {
  type: "ping";
}

export type BridgeCommand =
  | SendMessageCommand
  | CancelResponseCommand
  | PingCommand;

export interface ConnectionStateEvent {
  type: "connection_state";
  state: ConnectionState;
  bridgeSessionId: string;
  runtime: RuntimeKind;
  message?: string;
}

export interface UserMessageAcceptedEvent {
  type: "user_message_accepted";
  bridgeSessionId: string;
  clientMessageId: string;
  message: TranscriptMessage;
}

export interface AssistantStartedEvent {
  type: "assistant_started";
  bridgeSessionId: string;
  runId: string;
  message: TranscriptMessage;
}

export interface AssistantDeltaEvent {
  type: "assistant_delta";
  bridgeSessionId: string;
  runId: string;
  delta: string;
}

export interface AssistantCompletedEvent {
  type: "assistant_completed";
  bridgeSessionId: string;
  runId: string;
  runtimeSessionId?: string;
}

export interface AssistantCanceledEvent {
  type: "assistant_canceled";
  bridgeSessionId: string;
  runId: string;
}

export interface AssistantFailedEvent {
  type: "assistant_failed";
  bridgeSessionId: string;
  runId: string;
  error: ChatError;
}

export interface CommandRejectedEvent {
  type: "command_rejected";
  bridgeSessionId?: string;
  error: ChatError;
}

export interface PongEvent {
  type: "pong";
  bridgeSessionId: string;
}

export type BridgeEvent =
  | ConnectionStateEvent
  | UserMessageAcceptedEvent
  | AssistantStartedEvent
  | AssistantDeltaEvent
  | AssistantCompletedEvent
  | AssistantCanceledEvent
  | AssistantFailedEvent
  | CommandRejectedEvent
  | PongEvent;

export function createMessage(
  role: MessageRole,
  content: string,
  status: MessageStatus,
  id: string = crypto.randomUUID(),
): TranscriptMessage {
  const now = new Date().toISOString();
  return {
    id,
    role,
    content,
    status,
    createdAt: now,
    updatedAt: now,
  };
}

export function isBridgeCommand(value: unknown): value is BridgeCommand {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }

  if (value.type === "ping") {
    return true;
  }

  if (value.type === "send_message") {
    return (
      typeof value.clientMessageId === "string" &&
      typeof value.prompt === "string" &&
      optionalString(value.bridgeSessionId)
    );
  }

  if (value.type === "cancel_response") {
    return typeof value.runId === "string" && optionalString(value.bridgeSessionId);
  }

  return false;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}
