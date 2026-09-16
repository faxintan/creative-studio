import type {
  ChatError,
  RuntimeKind,
  TranscriptMessage,
} from "../../shared/protocol.js";

export interface RuntimeAvailability {
  available: boolean;
  kind: RuntimeKind;
  message: string;
}

export interface RuntimePromptRequest {
  bridgeSessionId: string;
  runId: string;
  prompt: string;
  modelId: string;
  history: TranscriptMessage[];
  runtimeSessionId?: string;
  signal: AbortSignal;
}

export interface RuntimeEventHandlers {
  onDelta(delta: string): void;
  onQueued(): void;
  onResolvedModel(modelId: string): void;
  onRuntimeSession(runtimeSessionId: string): void;
  onDiagnostic?(message: string): void;
}

export interface RuntimePromptResult {
  runtimeSessionId?: string;
  resolvedModelId?: string;
}

export interface TraeRuntimeAdapter {
  readonly kind: RuntimeKind;
  checkAvailability(): Promise<RuntimeAvailability>;
  sendPrompt(
    request: RuntimePromptRequest,
    handlers: RuntimeEventHandlers,
  ): Promise<RuntimePromptResult>;
  cancel?(runId: string): Promise<void>;
}

export class RuntimeError extends Error {
  readonly code: ChatError["code"];
  readonly details?: string;

  constructor(code: ChatError["code"], message: string, details?: string) {
    super(message);
    this.name = "RuntimeError";
    this.code = code;
    this.details = details;
  }
}
