## 1. Project Foundation

- [x] 1.1 Create the TypeScript web application and local bridge project structure and verify the expected frontend, bridge, and shared protocol directories exist
- [x] 1.2 Add local development scripts for starting the web UI and bridge together and verify the app can start on localhost
- [x] 1.3 Add shared TypeScript types for chat commands, chat events, message roles, run states, and error payloads and verify they are imported by both frontend and bridge code

## 2. Local Bridge

- [x] 2.1 Implement a local HTTP/WebSocket bridge bound to `127.0.0.1` by default and verify startup output shows localhost-only endpoints
- [x] 2.2 Implement browser command handling for non-empty message submission, empty-message rejection, and cancellation and verify each command produces the expected bridge event
- [x] 2.3 Implement per-browser-session runtime state mapping and verify follow-up messages reuse the same active bridge session
- [x] 2.4 Implement bridge error normalization for connection failures, runtime failures, and canceled runs and verify the frontend receives structured error events

## 3. TraeCode CLI Runtime Adapter

- [x] 3.1 Implement the `TraeRuntimeAdapter` boundary for sending prompts, streaming assistant output, continuing sessions, canceling responses, and reporting failures and verify bridge code depends only on that boundary
- [x] 3.2 Probe the local `traecli app-server` WebSocket mode and implement it as the preferred adapter when the protocol is usable, verifying partial assistant output is converted to bridge stream events
- [x] 3.3 Implement an `exec --json` fallback adapter and verify it can produce the same bridge event sequence for a single prompt
- [x] 3.4 Implement adapter selection and runtime availability checks and verify unavailable `traecli` produces a disconnected or failed state without crashing the bridge

## 4. AiChat Web UI

- [x] 4.1 Build the chat workspace layout with transcript, composer, run-state indicator, and bridge connection status and verify the first screen is the usable chat interface
- [x] 4.2 Implement message submission in the composer and verify non-empty prompts appear immediately as user messages while empty prompts are ignored
- [x] 4.3 Implement incremental assistant message rendering from stream events and verify deltas append to the active assistant message before completion
- [x] 4.4 Implement cancellation, failed-message display, and retry affordances and verify canceled or failed responses do not destroy the transcript
- [x] 4.5 Persist the visible transcript for browser reload recovery and verify reloading the page restores the active local chat transcript

## 5. Verification

- [x] 5.1 Run a local end-to-end smoke check against `traecli` and verify a prompt streams back into the browser UI
- [x] 5.2 Verify the bridge remains bound to localhost and no remote hosting, authentication, cloud storage, or shared-user behavior was introduced
- [x] 5.3 Verify the implementation satisfies every scenario in `specs/ai-chat-web/spec.md` and record any intentional limitations before marking the change complete

## Verification Notes

- 2026-09-15: Verified the local bridge health endpoint reports `host: "127.0.0.1"`, `runtime: "exec-json"`, and `runtimeAvailable: true`.
- 2026-09-15: Verified a direct WebSocket smoke prompt against `ws://127.0.0.1:8787/ws` emitted `connection_state`, `user_message_accepted`, `assistant_started`, `assistant_delta`, and `assistant_completed`, with assistant output `smoke-ok`.
- 2026-09-15: Verified the browser UI at `http://127.0.0.1:5173/` shows the transcript, composer, connection state, and runtime state; submitting `Reply with exactly: browser-smoke-ok` appended the user message immediately, displayed an assistant running state, then rendered `browser-smoke-ok` in the assistant message.
- 2026-09-15: Verified reloading the browser page restores the visible transcript from local storage.
- 2026-09-15: Verified same-session follow-up behavior through the bridge by sending two prompts over one bridge session and receiving two completed assistant runs.
- 2026-09-15: Verified cancellation through the bridge by canceling an active third run and receiving `assistant_canceled`.
- 2026-09-15: Verified WebSocket Origin protection rejects an unapproved remote origin with HTTP 403.
- 2026-09-15: Verified runtime failure normalization with an isolated temporary bridge on port 8788, receiving `assistant_failed` with `runtime_failed` details while preserving the transcript contract.
- Intentional limitations remain the scoped product constraints from the proposal/design: local-only, single-user, no authentication, no cloud persistence, no remote hosting, and no shared-user behavior. App-server mode remains adapter-backed and requires `AICHAT_TRAE_APP_SERVER_WS`; this local smoke used the `exec-json` fallback because no app-server endpoint was configured.
