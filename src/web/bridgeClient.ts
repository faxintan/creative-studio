import type { BridgeCommand, BridgeEvent, ConnectionState } from "../shared/protocol.js";

export interface BridgeClientStatus {
  state: ConnectionState;
  message: string;
}

interface BridgeClientOptions {
  sessionId: string;
  onEvent(event: BridgeEvent): void;
  onStatus(status: BridgeClientStatus): void;
}

export class BridgeClient {
  private socket?: WebSocket;
  private reconnectTimer?: number;
  private reconnectAttempt = 0;
  private manuallyClosed = false;

  constructor(private readonly options: BridgeClientOptions) {}

  connect(): void {
    this.manuallyClosed = false;
    this.setStatus("connecting", "Connecting");

    const socket = new WebSocket(this.buildWebSocketUrl());
    this.socket = socket;

    socket.addEventListener("open", () => {
      this.reconnectAttempt = 0;
      this.setStatus("connected", "Connected");
      this.send({ type: "ping" });
    });

    socket.addEventListener("message", (event) => {
      try {
        this.options.onEvent(JSON.parse(String(event.data)) as BridgeEvent);
      } catch {
        this.setStatus("connected", "Received an unreadable bridge event");
      }
    });

    socket.addEventListener("close", () => {
      this.setStatus("disconnected", "Disconnected");
      this.scheduleReconnect();
    });

    socket.addEventListener("error", () => {
      this.setStatus("disconnected", "Bridge unavailable");
    });
  }

  disconnect(): void {
    this.manuallyClosed = true;
    window.clearTimeout(this.reconnectTimer);
    this.socket?.close();
  }

  send(command: BridgeCommand): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    this.socket.send(JSON.stringify(command));
    return true;
  }

  private scheduleReconnect(): void {
    if (this.manuallyClosed) {
      return;
    }

    window.clearTimeout(this.reconnectTimer);
    const delay = Math.min(500 * 2 ** this.reconnectAttempt, 4000);
    this.reconnectAttempt += 1;
    this.reconnectTimer = window.setTimeout(() => this.connect(), delay);
  }

  private buildWebSocketUrl(): string {
    const configured = import.meta.env.VITE_AICHAT_BRIDGE_URL as string | undefined;
    const token = import.meta.env.VITE_AICHAT_BRIDGE_TOKEN as string | undefined;
    const base =
      configured ||
      (window.location.port === "8787"
        ? `${window.location.protocol}//${window.location.host}`
        : "http://127.0.0.1:8787");
    const url = new URL("/ws", base);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("sessionId", this.options.sessionId);
    if (token) {
      url.searchParams.set("token", token);
    }
    return url.toString();
  }

  private setStatus(state: ConnectionState, message: string): void {
    this.options.onStatus({ state, message });
  }
}
