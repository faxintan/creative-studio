## Why

AiChat currently uses one bridge-configured model and gives users no visibility into model demand before or after submitting a prompt. Users need to choose an available TraeCode CLI model, understand its reported load, and see when an accepted request is waiting for model capacity.

## What Changes

- Add a model selector to the AiChat composer using the model catalog reported by the local TraeCode CLI.
- Display each model's latest reported load when that data is available, without treating missing data as zero load.
- Apply a changed model to the next submitted message and subsequent messages while preserving the active conversation.
- Record the selected model on each assistant response so the transcript shows which model handled the request.
- Add an explicit queued run state when TraeCode CLI reports that a submitted request is waiting for model capacity.
- Allow queued requests to be canceled using the existing cancellation workflow.
- Keep submitting, queued, streaming, completed, canceled, and failed states distinct in the browser-to-bridge protocol.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ai-chat-web`: Add runtime model discovery and selection, reported model load visibility, per-message model attribution, and explicit capacity-queue feedback.

## Impact

- Extends the shared browser-to-bridge protocol with model catalog data, selected-model fields, model refresh commands, model attribution, and queued lifecycle events.
- Extends the runtime adapter boundary so both app-server and `exec --json` integrations receive the selected model and normalize queue notifications.
- Adds a bridge-owned model catalog provider backed by `traecli models --json`, with bounded caching and refresh behavior.
- Updates browser state, transcript persistence, composer controls, and run-state rendering.
- Does not add automatic model switching, synthetic queue estimates, remote model administration, pricing displays, or cloud persistence.
