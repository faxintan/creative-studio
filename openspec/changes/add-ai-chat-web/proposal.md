## Why

Users need a local browser-based AiChat interface that can exchange messages with TraeCode CLI while preserving a responsive, streaming chat experience.

This solves the first-step product need for a lightweight web UI over a local agent runtime without introducing cloud deployment, multi-user access, or account management.

## What Changes

- Add a local-only AiChat web application as the first user-facing surface.
- Add a local bridge service that accepts browser messages and forwards them to `traecli`.
- Stream `traecli` responses back to the browser so assistant output appears incrementally.
- Track per-browser chat session state so follow-up messages can continue the same conversation.
- Surface connection, running, cancellation, and error states in the chat UI.
- Keep the first version scoped to single-user local development on `localhost`.

## Capabilities

### New Capabilities

- `ai-chat-web`: Local browser chat experience backed by a local bridge to `traecli`, including message submission, streaming responses, session continuity, cancellation, and error feedback.

### Modified Capabilities

- None.

## Impact

- Adds a frontend web app for the AiChat interface.
- Adds a local Node-compatible bridge process between the browser and `traecli`.
- Uses `traecli` as the agent backend; first implementation should prefer the local app-server/WebSocket integration when practical, with `traecli exec --json` as an adapter fallback if the app-server protocol is not stable enough.
- Introduces a small typed protocol between the browser and bridge for chat events, lifecycle state, and errors.
- Does not add remote deployment, authentication, shared team sessions, cloud storage, or direct browser access to shell commands.
