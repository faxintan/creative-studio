## Context

See `proposal.md` for motivation and scope. The repository is currently greenfield, with no application source and no baseline OpenSpec capabilities.

The local machine has `traecli` available. Its CLI exposes `exec --json`, `resume`, and an experimental `app-server` with WebSocket listening support. Browser code cannot safely or directly execute local CLI processes, so the web UI needs a local bridge process.

## Goals / Non-Goals

**Goals:**

- Keep the browser UI responsive while assistant output streams.
- Keep UI rendering separate from local runtime control.
- Encapsulate `traecli` behind a runtime adapter so the bridge can switch between app-server and exec-style integration without changing UI code.
- Keep the first version local-only and single-user.
- Make connection, running, canceled, and failed states explicit in the UI protocol.

**Non-Goals:**

- Remote hosting or shared access.
- Authentication and account management.
- Cloud persistence or cross-device history sync.
- Direct browser access to shell execution.
- Building a general multi-agent orchestration backend.

## Decisions

### Use a local bridge between browser and TraeCode CLI

The browser talks only to a local HTTP/WebSocket bridge bound to `127.0.0.1`. The bridge owns the process/protocol integration with `traecli`.

Rationale: browsers cannot directly spawn local CLI processes, and exposing arbitrary command execution to the page would be unsafe. A bridge gives one narrow control surface: chat messages in, structured chat events out.

Alternative considered: run all logic in the browser. Rejected because it cannot access `traecli` or workspace-local process control directly.

### Prefer `traecli app-server` behind an adapter, with `exec --json` fallback

The bridge defines a `TraeRuntimeAdapter` boundary with operations for sending a prompt, streaming events, continuing a session, and canceling an active response.

Primary integration should probe and use the local `traecli app-server` WebSocket mode because it is designed for long-lived app interaction. If the protocol is not stable enough for the first implementation, the bridge can use `traecli exec --json` as a fallback adapter while preserving the same bridge-to-browser event protocol.

Rationale: the UI and bridge protocol should not depend on which `traecli` transport is used. This keeps the first version practical without locking the architecture to a subprocess-per-message model.

Alternative considered: hard-code `traecli exec --json` directly into route handlers. Rejected because cancellation, session continuity, and future app-server adoption would become scattered across the bridge.

### Use WebSocket for browser-to-bridge chat events

The bridge serves the web app and exposes a local WebSocket endpoint for chat events. The browser sends typed commands such as `send_message` and `cancel_response`; the bridge emits typed events such as `assistant_delta`, `assistant_completed`, `assistant_failed`, and `connection_state`.

Rationale: WebSocket supports bidirectional low-latency events, which fits streaming responses and cancellation better than request/response HTTP. It also keeps the page free to update rendering incrementally.

Alternative considered: Server-Sent Events plus HTTP POST. This is acceptable for one-way streaming, but cancellation and session lifecycle require a second channel and more coordination.

### Keep session state local and minimal

The first version stores the visible transcript in browser-local state with optional local persistence for reload recovery. The bridge stores only the active runtime session mapping needed to continue messages and cancel in-flight work.

Rationale: the feature is local-only and single-user. Persisting full chat history server-side is unnecessary for the first version and would add migration concerns before the product shape is clear.

Alternative considered: durable server-side SQLite history. Deferred until users need searchable or cross-session history beyond browser reload recovery.

### Design the UI as a focused tool surface

The first screen is the chat workspace itself: transcript, composer, run state, and a compact session/status area. Visual styling should be restrained, dark-neutral, and tool-oriented with orange as the accent color.

Rationale: this is an operational local tool, not a landing page. The interface should optimize repeated prompting, reading streamed output, interruption, and retry.

## Risks / Trade-offs

- `traecli app-server` is experimental -> keep the runtime adapter boundary and allow an `exec --json` fallback without changing UI behavior.
- Subprocess fallback may have higher startup latency -> stream JSONL events immediately and keep UI states explicit so users see progress.
- Session continuation semantics may differ between `app-server`, `resume`, and `exec` -> isolate session ID handling in the runtime adapter and expose only stable bridge session IDs to the browser.
- Local bridge can expose sensitive workspace behavior if bound broadly -> bind to `127.0.0.1` by default and do not add remote access in this change.
- Cancellation may not terminate every backend operation instantly -> mark canceled responses in the UI and ensure late backend events for canceled runs are ignored.

## Migration Plan

This is a greenfield addition. Implementation can be added behind local development scripts without migrating existing source.

Rollback is removing the new application files, bridge files, and scripts introduced by this change. No persistent project data migration is required.
