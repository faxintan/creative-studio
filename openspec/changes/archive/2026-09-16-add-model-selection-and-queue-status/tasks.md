## 1. Shared Protocol and Persistence

- [x] 1.1 Extend the shared protocol with model summaries, catalog request/snapshot/error messages, required per-message `modelId`, assistant model attribution, and `submitting`/`queued` lifecycle types; verify invalid commands and valid new payloads are distinguished by focused protocol checks.
- [x] 1.2 Update transcript and preference persistence to tolerate pre-change messages, retain assistant model attribution, and restore only valid model selections; verify old and new storage fixtures decode without losing transcript content.

## 2. Bridge Model Catalog

- [x] 2.1 Implement structured parsing for `traecli models --json`, preserving finite load values above 100 and leaving omitted load absent; verify parser fixtures cover populated, missing, malformed, and above-100 load data.
- [x] 2.2 Implement the bridge-owned catalog provider with bounded caching, shared concurrent lookups, forced refresh, stale-snapshot retention, and normalized discovery errors; verify focused provider checks cover cache hits, refreshes, concurrent requests, and command failures.
- [x] 2.3 Wire catalog request and refresh commands into the bridge without coupling catalog failures to active chat runs; verify a connected client receives either a complete snapshot or an actionable catalog error event.

## 3. Runtime Adapter Inputs and Queue Signals

- [x] 3.1 Extend `RuntimePromptRequest` with immutable per-run model input and add a deduplicated queued callback to the adapter contract; verify TypeScript rejects adapters that omit the updated contract.
- [x] 3.2 Update the exec adapter to pass the run model through `--model` and recognize only allowlisted explicit capacity-waiting JSON events; verify payload fixtures do not treat load, elapsed time, or a bare `queue_size` as queued.
- [x] 3.3 Update the app-server adapter to pass the run model on thread and turn starts while preserving runtime session continuity, and normalize explicit capacity-waiting notifications; verify request and notification fixtures cover model switching, queued transitions, and direct streaming.
- [x] 3.4 Normalize a runtime-reported resolved model when available while retaining the requested model otherwise; verify each adapter produces stable attribution for the full run.

## 4. Bridge Run Orchestration

- [x] 4.1 Validate each submitted `modelId` against the latest catalog, refresh once for an unknown identifier, and reject unavailable models without fallback; verify rejection preserves the prompt context and does not invoke a runtime adapter with another model.
- [x] 4.2 Freeze the accepted model into the active-run record and emit assistant attribution with the submitting event; verify changing the browser selection after submission cannot alter adapter input for the active run.
- [x] 4.3 Implement `submitting -> queued -> streaming -> terminal` event handling with terminal-state guards; verify direct streaming, repeated queue events, queued streaming, failure, and late-event sequences produce monotonic browser events.
- [x] 4.4 Extend existing cancellation handling to submitting and queued runs and discard later runtime events; verify a queued cancellation invokes the adapter once and ends in canceled state.

## 5. Browser Model and Lifecycle Experience

- [x] 5.1 Add browser state and client handling for catalog loading, refresh, errors, selected-model persistence, and atomic inclusion of `modelId` in each send command; verify changing selection during an active response affects only the next submission.
- [x] 5.2 Add an accessible model selector and refresh control to the composer, showing reported load verbatim and missing load as unavailable; verify normal, above-100, missing-load, loading, stale, empty, and error states render without blocking unrelated active-run updates.
- [x] 5.3 Render submitting, queued, streaming, and terminal states distinctly, keep cancellation available while queued, and persist model attribution in assistant message metadata; verify reload preserves completed and terminal transcript attribution.
- [x] 5.4 Refine responsive styles for the selector, load text, lifecycle labels, and composer controls using the existing visual language; verify desktop and narrow mobile layouts have no overlap, truncation, or layout shift.

## 6. Integrated Verification

- [x] 6.1 Run the focused protocol, catalog, adapter, orchestration, and storage checks plus `npm run check` and `npm run build`; verify all commands complete successfully.
- [x] 6.2 Exercise the local app-server path with model refresh, next-message switching, conversation continuity, explicit queue handling when emitted, queued cancellation, and transcript reload; record the observed result for each scenario.
- [x] 6.3 Exercise the `exec --json` fallback with model selection, direct streaming when no queue signal exists, cancellation, unavailable-model failure, and missing-load display; verify the UI never infers queue position, wait time, or queued state.

## 7. Startup Recovery and Port Reuse

- [x] 7.1 Make the Bridge push a model catalog snapshot immediately after an accepted WebSocket connection, retain idempotent get/refresh commands, and verify a newly connected client receives the full catalog without an extra UI action.
- [x] 7.2 Adjust catalog discovery timeout and error normalization for slow CLI startup and stderr warnings; verify valid stdout still produces a complete snapshot and slow/failing discovery produces an actionable error.
- [x] 7.3 Add browser recovery handling for catalog command rejection, protocol mismatch, and bounded retry; verify the selector cannot remain indefinitely on `Loading models...`.
- [x] 7.4 Add a project-owned development Bridge launcher that identifies and terminates only a previous project Bridge on the configured port, forwards signals, and reports unrelated port occupants without an unhandled `EADDRINUSE` stack trace.
- [x] 7.5 Add controlled Bridge listen-error handling and verify repeated `pnpm dev` startup replaces the stale Bridge, keeps Vite running, and serves the current protocol.
- [x] 7.6 Run focused startup/catalog/launcher checks plus `npm run check` and `npm run build`; verify model bootstrap, slow CLI recovery, protocol mismatch messaging, and repeated one-click startup.
