import "./styles.css";

import { BridgeClient, type BridgeClientStatus } from "./bridgeClient.js";
import {
  clearTranscript,
  loadSelectedModelId,
  loadSessionId,
  loadTranscript,
  resolveSelectedModelId,
  saveSelectedModelId,
  saveTranscript,
} from "./storage.js";
import {
  createMessage,
  type BridgeEvent,
  type ChatError,
  type ConnectionState,
  type ModelCatalogSnapshot,
  type ModelSummary,
  type RuntimeKind,
  type TranscriptMessage,
} from "../shared/protocol.js";

interface UiState {
  sessionId: string;
  messages: TranscriptMessage[];
  connectionState: ConnectionState;
  runtime: RuntimeKind;
  statusMessage: string;
  models: ModelSummary[];
  modelCatalogState: "loading" | "ready" | "error";
  modelCatalogStale: boolean;
  modelCatalogMessage: string;
  selectedModelId?: string;
  modelCatalogTimer?: number;
  activeRunId?: string;
  activeAssistantMessageId?: string;
}

const state: UiState = {
  sessionId: loadSessionId(),
  messages: loadTranscript(),
  connectionState: "connecting",
  runtime: "unavailable",
  statusMessage: "Connecting",
  models: [],
  modelCatalogState: "loading",
  modelCatalogStale: false,
  modelCatalogMessage: "Loading models",
  selectedModelId: loadSelectedModelId(),
};

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) {
  throw new Error("App root not found.");
}

root.innerHTML = `
  <div class="app-shell">
    <header class="topbar">
      <div class="brand-block">
        <div class="brand-mark">AI</div>
        <div>
          <h1>Creative Studio AiChat</h1>
          <p id="session-label"></p>
        </div>
      </div>
      <div class="status-stack">
        <span id="connection-pill" class="status-pill">Connecting</span>
        <span id="runtime-pill" class="runtime-pill">Runtime unavailable</span>
      </div>
    </header>

    <main id="transcript" class="transcript" aria-live="polite"></main>

    <form id="composer-form" class="composer">
      <div class="model-toolbar">
        <label class="model-field" for="model-select">
          <span>Model</span>
          <select id="model-select" aria-describedby="model-catalog-message"></select>
        </label>
        <span id="model-load" class="model-load"></span>
        <button
          id="refresh-models-button"
          type="button"
          class="icon-button"
          aria-label="Refresh models"
          title="Refresh models"
        >&#8635;</button>
        <span id="model-catalog-message" class="model-catalog-message"></span>
      </div>
      <textarea
        id="composer-input"
        rows="1"
        placeholder="Message TraeCode CLI"
        aria-label="Message TraeCode CLI"
      ></textarea>
      <div class="composer-actions">
        <button id="clear-button" type="button" class="ghost-button">Clear</button>
        <button id="cancel-button" type="button" class="ghost-button">Cancel</button>
        <button id="send-button" type="submit" class="primary-button">Send</button>
      </div>
    </form>
  </div>
`;

const transcriptEl = mustGet<HTMLDivElement>("transcript");
const formEl = mustGet<HTMLFormElement>("composer-form");
const inputEl = mustGet<HTMLTextAreaElement>("composer-input");
const sendButton = mustGet<HTMLButtonElement>("send-button");
const cancelButton = mustGet<HTMLButtonElement>("cancel-button");
const clearButton = mustGet<HTMLButtonElement>("clear-button");
const modelSelect = mustGet<HTMLSelectElement>("model-select");
const modelLoad = mustGet<HTMLSpanElement>("model-load");
const modelCatalogMessage = mustGet<HTMLSpanElement>("model-catalog-message");
const refreshModelsButton = mustGet<HTMLButtonElement>("refresh-models-button");
const connectionPill = mustGet<HTMLSpanElement>("connection-pill");
const runtimePill = mustGet<HTMLSpanElement>("runtime-pill");
const sessionLabel = mustGet<HTMLParagraphElement>("session-label");

const bridge = new BridgeClient({
  sessionId: state.sessionId,
  onStatus: handleClientStatus,
  onEvent: handleBridgeEvent,
});

formEl.addEventListener("submit", (event) => {
  event.preventDefault();
  submitPrompt(inputEl.value);
});

inputEl.addEventListener("input", () => {
  inputEl.style.height = "auto";
  inputEl.style.height = `${Math.min(inputEl.scrollHeight, 180)}px`;
  updateControls();
});

inputEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    formEl.requestSubmit();
  }
});

cancelButton.addEventListener("click", () => {
  if (!state.activeRunId) {
    return;
  }
  bridge.send({
    type: "cancel_response",
    bridgeSessionId: state.sessionId,
    runId: state.activeRunId,
  });
});

clearButton.addEventListener("click", () => {
  state.messages = [];
  clearTranscript();
  render();
});

modelSelect.addEventListener("change", () => {
  state.selectedModelId = modelSelect.value || undefined;
  if (state.selectedModelId) {
    saveSelectedModelId(state.selectedModelId);
  }
  renderModelControls();
  updateControls();
});

refreshModelsButton.addEventListener("click", () => {
  if (state.connectionState !== "connected") {
    return;
  }
  requestModelCatalog(true);
  renderModelControls();
  bridge.send({ type: "refresh_models" });
});

transcriptEl.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const retryPrompt = target.dataset.retryPrompt;
  if (retryPrompt) {
    submitPrompt(retryPrompt);
  }
});

bridge.connect();
render();

function submitPrompt(rawPrompt: string): void {
  const prompt = rawPrompt.trim();
  if (!prompt) {
    updateStatus("Message cannot be empty.");
    return;
  }

  if (state.connectionState !== "connected") {
    updateStatus("Bridge unavailable.");
    return;
  }

  if (state.activeRunId) {
    updateStatus("Assistant response already running.");
    return;
  }

  if (!state.selectedModelId) {
    updateStatus("Select an available model before sending.");
    return;
  }

  const modelId = state.selectedModelId;
  const clientMessageId = crypto.randomUUID();
  const optimistic = createMessage("user", prompt, "complete", clientMessageId);
  upsertMessage(optimistic);
  inputEl.value = "";
  inputEl.style.height = "auto";
  persistAndRender();

  const sent = bridge.send({
    type: "send_message",
    bridgeSessionId: state.sessionId,
    clientMessageId,
    prompt,
    modelId,
  });

  if (!sent) {
    upsertSystemError({
      code: "bridge_unavailable",
      message: "Bridge unavailable.",
    });
  }
}

function handleClientStatus(status: BridgeClientStatus): void {
  state.connectionState = status.state;
  state.statusMessage = status.message;
  render();
}

function handleBridgeEvent(event: BridgeEvent): void {
  if ("bridgeSessionId" in event && event.bridgeSessionId) {
    state.sessionId = event.bridgeSessionId;
  }

  switch (event.type) {
    case "connection_state":
      state.connectionState = event.state;
      state.runtime = event.runtime;
      state.statusMessage = event.message ?? event.state;
      if (event.state === "connected") {
        requestModelCatalog(false);
        bridge.send({ type: "get_models" });
      }
      break;
    case "models_snapshot":
      clearModelCatalogTimer();
      applyModelSnapshot(event.snapshot);
      break;
    case "models_error":
      clearModelCatalogTimer();
      if (event.staleSnapshot) {
        applyModelSnapshot(event.staleSnapshot);
      }
      state.modelCatalogState = "error";
      state.modelCatalogStale = Boolean(event.staleSnapshot);
      state.modelCatalogMessage =
        event.error.details ?? event.error.message;
      break;
    case "user_message_accepted":
      upsertMessage(event.message);
      break;
    case "assistant_started":
      state.activeRunId = event.runId;
      state.activeAssistantMessageId = event.message.id;
      upsertMessage(event.message);
      break;
    case "assistant_queued":
      updateActiveMessageStatus(event.runId, "queued");
      break;
    case "assistant_model_updated":
      updateAssistantModel(event.runId, event.model);
      break;
    case "assistant_delta":
      appendAssistantDelta(event.runId, event.delta);
      break;
    case "assistant_completed":
      finishAssistantMessage(event.runId, "complete");
      break;
    case "assistant_canceled":
      finishAssistantMessage(event.runId, "canceled");
      break;
    case "assistant_failed":
      finishAssistantMessage(event.runId, "failed", event.error);
      break;
    case "command_rejected":
      if (state.modelCatalogState === "loading") {
        clearModelCatalogTimer();
        state.modelCatalogState = "error";
        state.modelCatalogMessage =
          event.error.code === "invalid_command"
            ? "Bridge protocol is outdated. Restart the Bridge, then retry."
            : event.error.details ?? event.error.message;
      }
      upsertSystemError(event.error);
      break;
    case "pong":
      break;
  }

  persistAndRender();
}

function appendAssistantDelta(runId: string, delta: string): void {
  if (runId !== state.activeRunId || !state.activeAssistantMessageId) {
    return;
  }

  const message = state.messages.find(
    (candidate) => candidate.id === state.activeAssistantMessageId,
  );
  if (!message) {
    return;
  }

  if (isTerminalStatus(message.status)) {
    return;
  }

  message.status = "streaming";
  message.content += delta;
  message.updatedAt = new Date().toISOString();
}

function updateActiveMessageStatus(
  runId: string,
  status: Extract<TranscriptMessage["status"], "queued" | "streaming">,
): void {
  if (runId !== state.activeRunId || !state.activeAssistantMessageId) {
    return;
  }
  const message = state.messages.find(
    (candidate) => candidate.id === state.activeAssistantMessageId,
  );
  if (!message || isTerminalStatus(message.status)) {
    return;
  }
  if (status === "queued" && message.status !== "submitting") {
    return;
  }
  message.status = status;
  message.updatedAt = new Date().toISOString();
}

function updateAssistantModel(
  runId: string,
  model: NonNullable<TranscriptMessage["model"]>,
): void {
  if (runId !== state.activeRunId || !state.activeAssistantMessageId) {
    return;
  }
  const message = state.messages.find(
    (candidate) => candidate.id === state.activeAssistantMessageId,
  );
  if (!message || isTerminalStatus(message.status)) {
    return;
  }
  message.model = model;
  message.updatedAt = new Date().toISOString();
}

function finishAssistantMessage(
  runId: string,
  status: "complete" | "failed" | "canceled",
  error?: ChatError,
): void {
  if (runId !== state.activeRunId || !state.activeAssistantMessageId) {
    return;
  }

  const message = state.messages.find(
    (candidate) => candidate.id === state.activeAssistantMessageId,
  );
  if (message) {
    message.status = status;
    message.error = error;
    message.updatedAt = new Date().toISOString();
  }

  state.activeRunId = undefined;
  state.activeAssistantMessageId = undefined;
}

function upsertMessage(message: TranscriptMessage): void {
  const index = state.messages.findIndex((candidate) => candidate.id === message.id);
  if (index >= 0) {
    state.messages[index] = message;
    return;
  }

  state.messages.push(message);
}

function upsertSystemError(error: ChatError): void {
  const message = createMessage("system", error.message, "failed");
  message.error = error;
  state.messages.push(message);
  persistAndRender();
}

function persistAndRender(): void {
  saveTranscript(state.messages);
  render();
}

function render(): void {
  sessionLabel.textContent = `Session ${state.sessionId.slice(0, 8)}`;
  connectionPill.textContent = state.statusMessage;
  connectionPill.dataset.state = state.connectionState;
  runtimePill.textContent = `Runtime ${state.runtime}`;
  runtimePill.dataset.runtime = state.runtime;
  renderModelControls();

  transcriptEl.replaceChildren();
  if (state.messages.length === 0) {
    const empty = document.createElement("section");
    empty.className = "empty-state";
    empty.textContent = "Start a local chat with TraeCode CLI.";
    transcriptEl.append(empty);
  } else {
    for (const message of state.messages) {
      transcriptEl.append(renderMessage(message));
    }
  }

  transcriptEl.scrollTop = transcriptEl.scrollHeight;
  updateControls();
}

function renderMessage(message: TranscriptMessage): HTMLElement {
  const article = document.createElement("article");
  article.className = `message message-${message.role}`;
  article.dataset.status = message.status;

  const meta = document.createElement("div");
  meta.className = "message-meta";

  const role = document.createElement("span");
  role.textContent = labelForRole(message.role);

  const status = document.createElement("span");
  status.textContent = labelForStatus(message.status);

  const messageContext = document.createElement("span");
  messageContext.className = "message-context";
  if (message.model) {
    const model = document.createElement("span");
    model.className = "message-model";
    model.textContent = message.model.label;
    model.title = message.model.id;
    messageContext.append(model);
  }
  messageContext.append(status);

  meta.append(role, messageContext);

  const body = document.createElement("div");
  body.className = "message-body";
  body.textContent = message.content || placeholderForMessage(message);

  article.append(meta, body);

  if (message.error) {
    const error = document.createElement("div");
    error.className = "message-error";
    error.textContent = message.error.details
      ? `${message.error.message}: ${message.error.details}`
      : message.error.message;
    article.append(error);
  }

  if (message.role === "assistant" && message.status === "failed") {
    const retryPrompt = findPromptBefore(message.id);
    if (retryPrompt) {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "inline-button";
      retry.textContent = "Retry";
      retry.dataset.retryPrompt = retryPrompt;
      article.append(retry);
    }
  }

  return article;
}

function updateControls(): void {
  const canSend =
    state.connectionState === "connected" &&
    Boolean(state.selectedModelId) &&
    Boolean(inputEl.value.trim()) &&
    !state.activeRunId;
  sendButton.disabled = !canSend;
  cancelButton.disabled = !state.activeRunId;
  inputEl.disabled = state.connectionState !== "connected";
  modelSelect.disabled = state.models.length === 0;
  refreshModelsButton.disabled =
    state.connectionState !== "connected" || state.modelCatalogState === "loading";
}

function updateStatus(message: string): void {
  state.statusMessage = message;
  render();
}

function labelForRole(role: TranscriptMessage["role"]): string {
  if (role === "user") {
    return "You";
  }
  if (role === "assistant") {
    return "TraeCode CLI";
  }
  return "System";
}

function labelForStatus(status: TranscriptMessage["status"]): string {
  if (status === "submitting") {
    return "Submitting";
  }
  if (status === "queued") {
    return "Queued for capacity";
  }
  if (status === "streaming") {
    return "Running";
  }
  if (status === "failed") {
    return "Failed";
  }
  if (status === "canceled") {
    return "Canceled";
  }
  return "";
}

function placeholderForMessage(message: TranscriptMessage): string {
  if (message.status === "submitting") {
    return "Submitting...";
  }
  if (message.status === "queued") {
    return "Waiting for model capacity...";
  }
  if (message.status === "streaming") {
    return "Waiting for output...";
  }
  if (message.status === "canceled") {
    return "Canceled.";
  }
  return "";
}

function applyModelSnapshot(snapshot: ModelCatalogSnapshot): void {
  state.models = snapshot.models;
  state.modelCatalogState = "ready";
  state.modelCatalogStale = snapshot.stale;
  state.modelCatalogMessage = snapshot.stale
    ? "Showing last available catalog"
    : `Updated ${formatObservedTime(snapshot.observedAt)}`;
  state.selectedModelId = resolveSelectedModelId(snapshot, state.selectedModelId);
  if (state.selectedModelId) {
    saveSelectedModelId(state.selectedModelId);
  }
}

function requestModelCatalog(forceRefresh: boolean): void {
  clearModelCatalogTimer();
  state.modelCatalogState = "loading";
  state.modelCatalogStale = false;
  state.modelCatalogMessage = forceRefresh
    ? "Refreshing models"
    : "Loading models";
  state.modelCatalogTimer = window.setTimeout(() => {
    state.modelCatalogTimer = undefined;
    if (state.modelCatalogState !== "loading") {
      return;
    }
    state.modelCatalogState = "error";
    state.modelCatalogMessage =
      "Model discovery timed out. Refresh models to retry.";
    render();
  }, 15_000);
}

function clearModelCatalogTimer(): void {
  if (state.modelCatalogTimer !== undefined) {
    window.clearTimeout(state.modelCatalogTimer);
    state.modelCatalogTimer = undefined;
  }
}

function renderModelControls(): void {
  const selected = state.selectedModelId;
  modelSelect.replaceChildren();

  if (state.models.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent =
      state.modelCatalogState === "loading" ? "Loading models..." : "No models available";
    modelSelect.append(option);
  } else {
    for (const model of state.models) {
      const option = document.createElement("option");
      option.value = model.id;
      option.textContent = model.label;
      option.selected = model.id === selected;
      modelSelect.append(option);
    }
  }

  const selectedModel = state.models.find((model) => model.id === selected);
  modelLoad.textContent = selectedModel
    ? selectedModel.loadPercent === undefined
      ? "Load unavailable"
      : `Load ${selectedModel.loadPercent}%`
    : "Load unavailable";
  modelLoad.dataset.available =
    selectedModel?.loadPercent === undefined ? "false" : "true";

  modelCatalogMessage.textContent = state.modelCatalogMessage;
  modelCatalogMessage.dataset.state = state.modelCatalogState;
  modelCatalogMessage.dataset.stale = String(state.modelCatalogStale);
}

function formatObservedTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "recently"
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function isTerminalStatus(status: TranscriptMessage["status"]): boolean {
  return status === "complete" || status === "failed" || status === "canceled";
}

function findPromptBefore(messageId: string): string | undefined {
  const index = state.messages.findIndex((message) => message.id === messageId);
  if (index <= 0) {
    return undefined;
  }

  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const message = state.messages[cursor];
    if (message.role === "user") {
      return message.content;
    }
  }

  return undefined;
}

function mustGet<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing element #${id}`);
  }
  return element as T;
}
