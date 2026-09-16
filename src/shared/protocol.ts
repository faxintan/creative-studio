export const BRIDGE_PROTOCOL_VERSION = "2026-09-16.ai-chat-models.v2";

export type RuntimeKind = "app-server" | "exec-json" | "unavailable";

export type ConnectionState = "connecting" | "connected" | "disconnected";

export type MessageRole = "user" | "assistant" | "system";

export type MessageStatus =
  | "idle"
  | "submitting"
  | "queued"
  | "streaming"
  | "complete"
  | "failed"
  | "canceled";

export interface ModelAttribution {
  id: string;
  label: string;
}

export interface ModelSummary extends ModelAttribution {
  loadPercent?: number;
}

export interface ModelCatalogSnapshot {
  models: ModelSummary[];
  observedAt: string;
  stale: boolean;
  defaultModelId?: string;
}

export interface TranscriptMessage {
  id: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  createdAt: string;
  updatedAt: string;
  model?: ModelAttribution;
  error?: ChatError;
}

export interface ChatError {
  code:
    | "bridge_unavailable"
    | "runtime_unavailable"
    | "runtime_failed"
    | "invalid_command"
    | "request_canceled"
    | "session_busy"
    | "model_catalog_unavailable"
    | "model_unavailable";
  message: string;
  details?: string;
}

export interface SendMessageCommand {
  type: "send_message";
  clientMessageId: string;
  bridgeSessionId?: string;
  prompt: string;
  modelId: string;
}

export interface CancelResponseCommand {
  type: "cancel_response";
  bridgeSessionId?: string;
  runId: string;
}

export interface PingCommand {
  type: "ping";
}

export interface GetModelsCommand {
  type: "get_models";
}

export interface RefreshModelsCommand {
  type: "refresh_models";
}

export type BridgeCommand =
  | SendMessageCommand
  | CancelResponseCommand
  | GetModelsCommand
  | RefreshModelsCommand
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

export interface AssistantQueuedEvent {
  type: "assistant_queued";
  bridgeSessionId: string;
  runId: string;
}

export interface AssistantModelUpdatedEvent {
  type: "assistant_model_updated";
  bridgeSessionId: string;
  runId: string;
  model: ModelAttribution;
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

export interface ModelsSnapshotEvent {
  type: "models_snapshot";
  bridgeSessionId: string;
  snapshot: ModelCatalogSnapshot;
}

export interface ModelsErrorEvent {
  type: "models_error";
  bridgeSessionId: string;
  error: ChatError;
  staleSnapshot?: ModelCatalogSnapshot;
}

export type BridgeEvent =
  | ConnectionStateEvent
  | UserMessageAcceptedEvent
  | AssistantStartedEvent
  | AssistantQueuedEvent
  | AssistantModelUpdatedEvent
  | AssistantDeltaEvent
  | AssistantCompletedEvent
  | AssistantCanceledEvent
  | AssistantFailedEvent
  | CommandRejectedEvent
  | ModelsSnapshotEvent
  | ModelsErrorEvent
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

  if (value.type === "get_models" || value.type === "refresh_models") {
    return true;
  }

  if (value.type === "send_message") {
    return (
      typeof value.clientMessageId === "string" &&
      typeof value.prompt === "string" &&
      typeof value.modelId === "string" &&
      value.modelId.trim().length > 0 &&
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
