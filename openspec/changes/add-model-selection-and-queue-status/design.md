## Context

See `proposal.md` for motivation and `specs/ai-chat-web/spec.md` for the behavior contract.

The browser, local bridge, and TraeCode CLI are separated by a shared WebSocket protocol and a `TraeRuntimeAdapter` boundary. The bridge currently applies one optional `TRAECLI_MODEL` value to every request. The app-server adapter can send a model on `thread/start` and `turn/start`; the exec adapter can pass `--model`. Neither adapter currently exposes queue transitions. Browser transcript state is persisted locally and currently represents an active response only as streaming.

`traecli models --json` is the source of model identifiers and optional `_meta.trae.load.percent` values. Reported percentages can exceed 100, and some models omit load. Runtime payloads can contain queue-related metadata, but only an explicit lifecycle/status indication that the current request is waiting for capacity is sufficient to enter the queued state.

The app-server protocol is experimental, so the design must preserve the `exec --json` fallback and keep runtime-specific payload handling behind adapters.

## Goals / Non-Goals

**Goals:**

- Keep model discovery and runtime payload interpretation in the bridge rather than coupling the browser to CLI formats.
- Freeze the selected model into each submitted run so later selector changes cannot mutate in-flight work.
- Preserve the active runtime conversation when the selected model changes.
- Normalize explicit capacity waiting into one protocol-level queued transition across both runtime adapters.
- Keep stored transcripts readable across the protocol and message-schema migration.

**Non-Goals:**

- Guaranteeing that the CLI will always provide load or queue telemetry.
- Deriving queue state, queue position, or wait time from load, latency, or incomplete metadata.
- Automatically choosing or switching models.
- Adding remote model administration, pricing data, or server-side transcript storage.

## Decisions

### 1. The bridge owns a model catalog provider

Add a bridge-side provider that invokes `traecli models --json`, parses the result into a runtime-independent model summary, and returns:

- stable model identifier used for requests
- display label when reported
- optional load percentage preserved as reported
- catalog observation timestamp

The provider keeps a short bounded cache to avoid starting a CLI process on every reconnect. An initial catalog request may use a fresh cached snapshot; an explicit refresh bypasses the cache. Concurrent refreshes share one in-flight lookup. A refresh failure does not rewrite missing load to zero or fabricate an empty successful catalog; the protocol reports the failure and may retain a clearly stale last successful snapshot for display.

The browser requests the catalog after connecting and can issue an explicit refresh command. The bridge responds with either a complete catalog snapshot or a catalog error event. This request/response shape keeps catalog failures separate from chat run failures.

Alternative considered: invoke `traecli models --json` directly from the browser. Rejected because browser code must not spawn local processes or understand CLI-specific JSON.

Alternative considered: attach catalog data to every connection-state event. Rejected because refresh and failure semantics need an independent lifecycle.

### 2. Model choice is immutable run input

Extend `send_message` with a required `modelId`. On command acceptance, the bridge copies that value into the active-run record and into `RuntimePromptRequest`; adapters never read a mutable global selection for an active run.

The bridge validates the identifier against its latest successful catalog. If it is unknown, the bridge performs one catalog refresh before rejecting the command. It never substitutes the configured default or another model. Runtime rejection after acceptance is normalized as a run failure.

`TRAECLI_MODEL` remains a startup preference for choosing the browser's initial selection when that identifier exists in the catalog. It is no longer the per-request source of truth. Otherwise, the browser selects the catalog's declared default when available, then the first available model. The selection is stored locally and restored only if it remains in the current catalog.

The app-server adapter passes the run's model to both new-thread and turn-start requests. The exec adapter passes the run's model through its global `--model` argument. Existing runtime session/thread identifiers remain unchanged when model selection changes, preserving conversation continuity.

Alternative considered: reconnect or create a new chat session on model change. Rejected because selection is defined to affect the next message while retaining the active conversation.

Alternative considered: send a separate `select_model` mutation to the bridge. Rejected because it introduces a race between selection and submission; including `modelId` in each command makes the binding atomic.

### 3. Assistant messages persist model attribution

Extend assistant transcript messages with optional model attribution containing at least the model identifier and the latest known display label. `assistant_started` carries the run-bound attribution, so the message has a stable value before queueing or streaming.

If a runtime adapter later reports a different resolved model identifier for the same run, the bridge emits a model-attribution update before the terminal event. Otherwise, the requested model remains the attributed model. Historical labels are stored with messages so catalog renames or temporary catalog failures do not erase transcript context.

The storage decoder accepts older messages without attribution and without the new active statuses. This is an additive local migration; no destructive transcript rewrite is required.

Alternative considered: resolve model labels only from the current catalog at render time. Rejected because historical messages would become misleading when catalogs change.

### 4. The protocol has an explicit run state machine

Bump the shared protocol version and add `submitting` and `queued` message statuses. A run follows these transitions:

`submitting -> queued -> streaming -> complete`

`submitting` may also transition directly to `streaming` or a terminal state. `queued` may transition to `streaming` or a terminal state. Cancellation and failure are terminal from any active state.

The bridge emits `assistant_started` with `submitting`, an `assistant_queued` event for an explicit capacity wait, and existing delta/terminal events afterward. The first assistant delta moves the browser to `streaming`, even if no separate streaming-start event arrives. The browser ignores state regressions and ignores delta or lifecycle events after a run becomes terminal.

Cancellation uses the existing `cancel_response` command for submitting, queued, and streaming runs. The active-run cancellation guard remains authoritative, and late runtime events are discarded.

Alternative considered: keep queued as display-only text while retaining `streaming`. Rejected because cancellation, persistence, and event ordering need an explicit lifecycle state.

### 5. Queue detection is adapter-owned and allowlisted

Add an `onQueued` runtime handler. Each adapter maps only documented or observed explicit status/lifecycle payloads for the current request that mean "accepted and waiting for capacity." Runtime-specific parsing stays next to the adapter and is covered by payload fixtures.

Load percentage never triggers `onQueued`. Elapsed time never triggers it. A bare `queue_size` field without a matching queued lifecycle/status never triggers it. Unknown queue-like payloads are retained only in diagnostic logging until their semantics are verified.

Adapters deduplicate repeated queue notifications for a run. They do not expose queue position or estimated wait unless a future protocol revision establishes reliable runtime fields and corresponding requirements.

Alternative considered: infer queueing after a timeout or from high model load. Rejected because it would present speculation as runtime state.

### 6. Catalog and runtime failures remain separate

Add catalog-specific protocol errors for unavailable or malformed model discovery. Keep request validation and runtime failures on the existing command/run error paths. This prevents a failed refresh from terminating an unrelated active response.

CLI JSON parsing uses structured validation at the provider/adapter boundaries. Unknown fields are ignored, missing optional load remains absent, and finite numeric load values are preserved without clamping.

## Risks / Trade-offs

- [CLI model schema changes] -> Isolate parsing in the catalog provider, reject unusable snapshots, retain the last successful snapshot as stale, and add representative parser fixtures.
- [Experimental app-server queue events change] -> Keep allowlisted mappings adapter-local; unknown events do not alter user-visible state and can be added after verification.
- [Catalog becomes stale between validation and submission] -> Let the runtime produce an actionable failure and never silently fall back to another model.
- [Runtime does not emit queue events in one adapter mode] -> Remain in submitting until output or a terminal event; do not infer queueing.
- [Model switching is unsupported for an existing runtime thread] -> Surface the runtime failure without discarding the transcript or automatically creating a new conversation.
- [Protocol version mismatch during local development] -> Use the existing connection/version boundary to reject incompatible clients clearly; deploy bridge and web assets together.

## Migration Plan

1. Extend shared protocol types and tolerant browser storage decoding, then update bridge and browser consumers in the same build.
2. Add the model catalog provider and expose catalog request, refresh, snapshot, and error messages.
3. Pass immutable per-run model input through both runtime adapters while retaining `TRAECLI_MODEL` only as an initial preference.
4. Add queue normalization and the submitting/queued browser state transitions.
5. Roll out the bridge and bundled web assets together, then verify both app-server and exec fallback modes against representative CLI output.

Rollback is a single-version rollback of bridge and web assets. Stored transcript messages with additive model fields remain readable by code that ignores unknown properties; active runs are not migrated across process restarts.
