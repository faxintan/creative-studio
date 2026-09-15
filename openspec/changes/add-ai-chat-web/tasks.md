## 1. Project Foundation

- [ ] 1.1 Create the TypeScript web application and local bridge project structure and verify the expected frontend, bridge, and shared protocol directories exist
- [ ] 1.2 Add local development scripts for starting the web UI and bridge together and verify the app can start on localhost
- [ ] 1.3 Add shared TypeScript types for chat commands, chat events, message roles, run states, and error payloads and verify they are imported by both frontend and bridge code

## 2. Local Bridge

- [ ] 2.1 Implement a local HTTP/WebSocket bridge bound to `127.0.0.1` by default and verify startup output shows localhost-only endpoints
- [ ] 2.2 Implement browser command handling for non-empty message submission, empty-message rejection, and cancellation and verify each command produces the expected bridge event
- [ ] 2.3 Implement per-browser-session runtime state mapping and verify follow-up messages reuse the same active bridge session
- [ ] 2.4 Implement bridge error normalization for connection failures, runtime failures, and canceled runs and verify the frontend receives structured error events

## 3. TraeCode CLI Runtime Adapter

- [ ] 3.1 Implement the `TraeRuntimeAdapter` boundary for sending prompts, streaming assistant output, continuing sessions, canceling responses, and reporting failures and verify bridge code depends only on that boundary
- [ ] 3.2 Probe the local `traecli app-server` WebSocket mode and implement it as the preferred adapter when the protocol is usable, verifying partial assistant output is converted to bridge stream events
- [ ] 3.3 Implement an `exec --json` fallback adapter and verify it can produce the same bridge event sequence for a single prompt
- [ ] 3.4 Implement adapter selection and runtime availability checks and verify unavailable `traecli` produces a disconnected or failed state without crashing the bridge

## 4. AiChat Web UI

- [ ] 4.1 Build the chat workspace layout with transcript, composer, run-state indicator, and bridge connection status and verify the first screen is the usable chat interface
- [ ] 4.2 Implement message submission in the composer and verify non-empty prompts appear immediately as user messages while empty prompts are ignored
- [ ] 4.3 Implement incremental assistant message rendering from stream events and verify deltas append to the active assistant message before completion
- [ ] 4.4 Implement cancellation, failed-message display, and retry affordances and verify canceled or failed responses do not destroy the transcript
- [ ] 4.5 Persist the visible transcript for browser reload recovery and verify reloading the page restores the active local chat transcript

## 5. Verification

- [ ] 5.1 Run a local end-to-end smoke check against `traecli` and verify a prompt streams back into the browser UI
- [ ] 5.2 Verify the bridge remains bound to localhost and no remote hosting, authentication, cloud storage, or shared-user behavior was introduced
- [ ] 5.3 Verify the implementation satisfies every scenario in `specs/ai-chat-web/spec.md` and record any intentional limitations before marking the change complete
