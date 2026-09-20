# Tasks: VS Code-like Code Viewer

**Input**: Design documents from `specs/001-code-viewer/`

**Prerequisites**: `spec.md`, `plan.md`, `research.md`, `data-model.md`,
`contracts/workspace-api.md`, `quickstart.md`

**Tests**: Minimal constitution-required unit and contract coverage was added during
implementation in `apps/bridge/src/domain/workspace/path-guard.test.ts` and
`packages/contracts/src/workspace-api.test.ts`. The tests were not executed in this
session; validation also uses the fixture workspace and `quickstart.md`.

**Organization**: Tasks are grouped by user story to support incremental delivery.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it targets different files and has no dependency
  on incomplete work.
- **[Story]**: Maps a task to a user story from `spec.md`.
- Every task names the concrete file or directory it creates or changes.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish the pnpm workspace, application packages, TypeScript tooling,
and deterministic fixture inputs.

- [x] T001 Create the pnpm workspace manifests in `package.json`, `pnpm-workspace.yaml`, and `.gitignore` for `apps/web`, `apps/bridge`, `packages/contracts`, and `tests`.
- [x] T002 [P] Initialize the React/Vite application package and scripts in `apps/web/package.json` and `apps/web/tsconfig.json`.
- [x] T003 [P] Initialize the Node.js/Fastify Bridge package and scripts in `apps/bridge/package.json` and `apps/bridge/tsconfig.json`.
- [x] T004 [P] Initialize the shared contracts package and exports in `packages/contracts/package.json`, `packages/contracts/tsconfig.json`, and `packages/contracts/src/index.ts`.
- [x] T005 Configure shared TypeScript, formatting, and linting rules in `tsconfig.base.json`, `eslint.config.mjs`, and `prettier.config.mjs`.
- [x] T006 Create the deterministic code-viewer fixture workspace under `tests/fixtures/code-viewer-workspace/` with source, configuration, documentation, empty-file, unknown-text, and permission-error fixtures.

**Checkpoint**: The workspace installs and starts the web and Bridge packages with
the planned development scripts.

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Implement shared contracts, Bridge security, filesystem boundaries, and
frontend application boundaries required by all user stories.

**CRITICAL**: No user story implementation begins until this phase is complete.

- [x] T007 Define shared domain types for `Workspace`, `FileNode`, `OpenDocument`, `ViewerContent`, `SearchQuery`, and `SearchResult` in `packages/contracts/src/domain.ts` using the field rules from `data-model.md`.
- [x] T008 Define the versioned request, response, and common error schemas from `contracts/workspace-api.md` in `packages/contracts/src/workspace-api.ts`, including runtime validation schemas.
- [x] T009 [P] Create the Bridge transport/application/domain/infrastructure module boundaries in `apps/bridge/src/transport/`, `apps/bridge/src/application/`, `apps/bridge/src/domain/`, and `apps/bridge/src/infrastructure/`.
- [x] T010 Implement Bridge Origin allowlist or local-token validation in `apps/bridge/src/transport/security/origin-guard.ts` and `apps/bridge/src/transport/security/token-guard.ts`.
- [x] T011 Implement normalized workspace-root and relative-path enforcement in `apps/bridge/src/domain/workspace/path-guard.ts`, rejecting traversal, symlink escapes, arbitrary absolute paths, and roots outside the selected workspace.
- [x] T012 [P] Implement shared Bridge error codes and English-safe error normalization in `apps/bridge/src/domain/errors.ts` and `apps/bridge/src/transport/error-handler.ts`.
- [x] T013 Create the Fastify server bootstrap, versioned routing, configuration loading, and graceful shutdown in `apps/bridge/src/server.ts`, `apps/bridge/src/transport/routes.ts`, and `apps/bridge/src/config.ts`.
- [x] T014 Create the FSD frontend source boundaries and application bootstrap in `apps/web/src/app/`, `apps/web/src/pages/code-viewer/`, `apps/web/src/widgets/`, `apps/web/src/features/`, `apps/web/src/entities/`, and `apps/web/src/shared/`.
- [x] T015 Implement the typed Bridge HTTP client and request error normalization in `apps/web/src/shared/api/bridge-client.ts` and `apps/web/src/shared/api/api-error.ts`.
- [x] T016 Configure the shared session query/cache provider and application-level loading/error boundaries in `apps/web/src/app/providers/` and `apps/web/src/app/App.tsx`.

**Checkpoint**: Shared contracts compile, Bridge requests are guarded, filesystem
paths are constrained to the workspace root, and the web app can call the versioned
Bridge client.

## Phase 3: User Story 1 - Open and Read a Workspace (Priority: P1) 🎯 MVP

**Goal**: Select a local workspace, show its root entries, and open a readable file.

**Independent Test**: Select `tests/fixtures/code-viewer-workspace`, inspect its root
entries, open `README.md`, and confirm content and active-file identity are visible.

### Implementation for User Story 1

- [x] T017 [US1] Implement workspace creation and session-root application logic in `apps/bridge/src/application/workspace/open-workspace.ts` and `apps/bridge/src/domain/workspace/path-guard.ts`.
- [x] T018 [US1] Implement `POST /api/v1/workspaces` and the host directory-picker route in `apps/bridge/src/transport/routes.ts`.
- [x] T019 [US1] Implement bounded directory enumeration and FileNode mapping in `apps/bridge/src/infrastructure/filesystem/list-directory.ts` and `apps/bridge/src/application/workspace/list-tree.ts`.
- [x] T020 [US1] Implement `GET /api/v1/workspaces/{workspaceId}/tree` with cursor and limit clamping in `apps/bridge/src/transport/routes.ts`.
- [x] T021 [US1] Implement bounded text-file reads, encoding detection, size guards, and file-state mapping in `apps/bridge/src/infrastructure/filesystem/read-text-file.ts` and `apps/bridge/src/application/files/read-file.ts`.
- [x] T022 [US1] Implement `GET /api/v1/workspaces/{workspaceId}/files/content` using workspace-relative paths in `apps/bridge/src/transport/routes.ts`.
- [x] T023 [P] [US1] Implement Workspace and FileNode client entities and session state in `apps/web/src/entities/workspace/model/` and `apps/web/src/entities/file/model/`.
- [x] T024 [P] [US1] Implement the open-workspace feature using the system directory selector and Bridge client in `apps/web/src/pages/code-viewer/ui/code-viewer-page.tsx` and `apps/web/src/shared/api/bridge-client.ts`.
- [x] T025 [US1] Implement the workspace explorer widget with root loading, child loading, empty state, unreadable state, and English error rendering in `apps/web/src/widgets/workspace-explorer/`.
- [x] T026 [US1] Implement file-opening state and content loading in `apps/web/src/pages/code-viewer/ui/code-viewer-page.tsx` and `apps/web/src/entities/viewer/model/`.
- [x] T027 [US1] Compose the initial code-viewer page and connect workspace selection, explorer, and file opening in `apps/web/src/pages/code-viewer/ui/code-viewer-page.tsx` and `apps/web/src/app/routes.tsx`.

**Checkpoint**: The P1 MVP opens a selected workspace, displays its tree, opens a
readable file, and preserves a usable explorer when file access fails.

## Phase 4: User Story 2 - Navigate Files and Open Documents (Priority: P1)

**Goal**: Expand and collapse folders, keep multiple documents open, switch tabs, and
close the active document predictably.

**Independent Test**: Open three fixture files, expand nested folders, switch between
tabs, and close the active tab while confirming the remaining selection.

### Implementation for User Story 2

- [x] T028 [US2] Add lazy folder expansion, child pagination, and expanded-path state to `apps/web/src/entities/file/model/file-tree-store.ts` and `apps/web/src/pages/code-viewer/ui/code-viewer-page.tsx`.
- [x] T029 [US2] Implement OpenDocument identity, active selection, duplicate-open prevention, and close fallback state in `apps/web/src/entities/document/model/document-store.ts`.
- [x] T030 [P] [US2] Implement open-document tab UI, active styling, and close controls in `apps/web/src/widgets/open-documents/ui/open-document-tabs.tsx`.
- [x] T031 [US2] Connect explorer file selection, document activation, and tab close behavior in `apps/web/src/pages/code-viewer/ui/code-viewer-page.tsx` and `apps/web/src/widgets/open-documents/ui/open-document-tabs.tsx`.
- [x] T032 [US2] Apply the transparent visibility policy to explorer and search inputs in `apps/web/src/entities/file/model/visibility-policy.ts` and `apps/bridge/src/infrastructure/filesystem/visibility-policy.ts`.

**Checkpoint**: User Stories 1 and 2 work together without duplicate tabs, lost tree
context, or an ambiguous active-document state.

## Phase 5: User Story 3 - Inspect Code with Readability Aids (Priority: P1)

**Goal**: Render readable content with line mapping, syntax-aware distinctions,
scrolling, and explicit content states.

**Independent Test**: Open recognized, unknown-text, empty, long-line, and unsupported
fixture files and verify the appropriate viewer state and navigation behavior.

### Implementation for User Story 3

- [x] T033 [P] [US3] Implement language detection and plain-text fallback mapping in `apps/web/src/entities/viewer/model/language-registry.ts`.
- [x] T034 [US3] Implement line mapping, line-number rendering, and bounded viewport state in `apps/web/src/entities/viewer/model/line-map.ts` and `apps/web/src/widgets/code-viewport/ui/code-viewport.tsx`.
- [x] T035 [US3] Implement syntax-aware content rendering with a stable plain-text fallback in `apps/web/src/widgets/code-viewport/ui/code-viewport.tsx`.
- [x] T036 [US3] Implement loading, empty, unreadable, unsupported, and file-too-large viewer states in `apps/web/src/widgets/code-viewport/ui/code-viewport.tsx`.
- [x] T037 [US3] Implement linked vertical and horizontal scrolling between line numbers and content in `apps/web/src/widgets/code-viewport/ui/code-viewport.tsx` and `apps/web/src/styles.css`.
- [x] T038 [US3] Add desktop and narrow-viewport layout constraints for explorer, tabs, search controls, and viewer in `apps/web/src/styles.css`.

**Checkpoint**: User Stories 1 through 3 provide a readable, scrollable, stateful
code-viewing experience on desktop and the supported narrow viewport.

## Phase 6: User Story 4 - Find Content in the Workspace (Priority: P2)

**Goal**: Search the active document and workspace, show bounded grouped results, and
navigate to a selected match.

**Independent Test**: Search the fixture workspace for `workspace`, navigate in-file
matches, select a workspace result, and confirm a zero-result search preserves the
active document.

### Implementation for User Story 4

- [x] T039 [US4] Implement literal case-insensitive search, bounded result collection, preview creation, and cancellation support in `apps/bridge/src/infrastructure/search/search-files.ts` and `apps/bridge/src/application/search/run-search.ts`.
- [x] T040 [US4] Implement `POST /api/v1/workspaces/{workspaceId}/search` with query validation, scope handling, result limits, and stable error responses in `apps/bridge/src/transport/routes/search.ts`.
- [x] T041 [US4] Implement SearchQuery and SearchResult entities, stale-request protection, and result selection state in `apps/web/src/entities/search/model/`.
- [x] T042 [P] [US4] Implement in-file search controls, match count, current-match navigation, and empty-query state in `apps/web/src/widgets/search-panel/ui/search-panel.tsx` and `apps/web/src/pages/code-viewer/ui/code-viewer-page.tsx`.
- [x] T043 [US4] Implement workspace result grouping and result activation in `apps/web/src/widgets/search-panel/ui/search-panel.tsx` and `apps/web/src/pages/code-viewer/ui/code-viewer-page.tsx`.
- [x] T044 [US4] Connect search-result activation to document opening and line/column reveal in `apps/web/src/pages/code-viewer/ui/code-viewer-page.tsx` and `apps/web/src/entities/viewer/model/reveal-position.ts`.
- [x] T045 [US4] Preserve the active document during zero-result and search-error states in `apps/web/src/entities/search/model/search-store.ts` and `apps/web/src/widgets/search-panel/ui/search-panel.tsx`.

**Checkpoint**: Workspace and in-file search are navigable, bounded, and do not
destroy the current readable document on failure.

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Close quality, security, accessibility, performance, and validation gaps
across all user stories.

- [x] T046 [P] Add keyboard navigation, focus management, accessible names, and selected-state semantics across `apps/web/src/widgets/` and `apps/web/src/shared/ui/`.
- [x] T047 [P] Add structured Bridge request logging without workspace content or secrets in `apps/bridge/src/transport/logging.ts`.
- [x] T048 Enforce response-size, directory-page, file-size, search-query, and search-result limits from `specs/001-code-viewer/contracts/workspace-api.md` in `apps/bridge/src/config/limits.ts` and `apps/bridge/src/transport/validation.ts`.
- [x] T049 Verify FSD import direction and shared-contract ownership across `apps/web/src/` and `packages/contracts/src/`, then document any justified exception in `specs/001-code-viewer/plan.md`.
- [x] T050 [P] Add fixture generation scripts for the 5,000-entry and 10,000-file scenarios in `tests/fixtures/scripts/generate-code-viewer-fixtures.ts`.
- [x] T051 Run the manual validation scenarios and record results against `specs/001-code-viewer/quickstart.md`.
- [ ] T052 Reconcile implementation against `spec.md`, `plan.md`, `data-model.md`, and `contracts/workspace-api.md`, then record remaining gaps for `/speckit-converge` in `specs/001-code-viewer/tasks.md`.

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; creates the workspace and fixture inputs.
- **Foundational (Phase 2)**: Depends on Phase 1; blocks every user story.
- **User Story 1 (Phase 3)**: Depends on Phase 2; establishes the MVP workspace and
  file-reading flow.
- **User Story 2 (Phase 4)**: Depends on Phase 3's workspace and file identity flow.
- **User Story 3 (Phase 5)**: Depends on Phase 3's content response and Phase 4's
  active-document model.
- **User Story 4 (Phase 6)**: Depends on Phase 3's Bridge workspace and file access;
  integrates with Phase 4 and Phase 5 for result activation and reveal.
- **Polish (Phase 7)**: Depends on the stories selected for delivery; T051 and T052
  require the implemented MVP scope to be available.

### User Story Dependencies

- **US1 (P1)**: Depends only on Foundational; MVP.
- **US2 (P1)**: Depends on US1 for workspace tree and file identity.
- **US3 (P1)**: Depends on US1 for file content and US2 for active documents.
- **US4 (P2)**: Depends on US1 for workspace access and integrates with US2/US3 for
  activation and line reveal.

### Parallel Opportunities

- T002, T003, and T004 can run in parallel after T001.
- T009, T012, and T014 can run in parallel after the package setup.
- T023 and T024 can run in parallel after the shared client foundation.
- T030 can run in parallel with T028 after the document entity contract is agreed.
- T033 can run in parallel with T036 after the viewer entity exists.
- T042 can run in parallel with T043 after the search entity exists.
- T046, T047, and T050 can run in parallel during Polish.

## Parallel Example: User Story 1

```text
After T007-T016 are complete:
- T017/T018: Bridge workspace creation and route
- T019/T020: Bridge tree listing and route
- T021/T022: Bridge content reading and route
- T023/T024: Frontend workspace/file entities and open-workspace feature
```

## Implementation Strategy

### MVP First

1. Complete Phase 1 and Phase 2.
2. Complete Phase 3, User Story 1.
3. Validate workspace selection, tree listing, file opening, and unreadable-file
   behavior using `quickstart.md`.
4. Stop for review before implementing tabs, syntax rendering, or search.

### Incremental Delivery

1. Add US1 for the first usable read-only workspace viewer.
2. Add US2 for multi-file navigation and document tabs.
3. Add US3 for line mapping, syntax readability, and viewport states.
4. Add US4 for in-file and workspace search.
5. Complete Phase 7 and run convergence review.

### Notes

- `[P]` marks only tasks that target different files and have no incomplete dependency.
- `[US1]` through `[US4]` map directly to the prioritized stories in `spec.md`.
- Unit and contract tests are present for the highest-risk Bridge and API boundaries;
  browser-level validation remains a manual quickstart step in this feature.
- Do not modify `spec.md` or `plan.md` to hide implementation gaps; append remaining
  work through `/speckit-converge`.
