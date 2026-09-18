# Implementation Plan: VS Code-like Code Viewer

**Branch**: `001-code-viewer` | **Date**: 2026-09-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-code-viewer/spec.md`

## Summary

Build a read-only local code viewer with a React web client and a Node.js Bridge
service. The client provides the explorer, open-document tabs, code viewport, and
search UI. The Bridge owns local filesystem access, workspace traversal, file reading,
and search execution. The frontend follows FSD boundaries; shared TypeScript contracts
define the Bridge API and error shapes.

The first version uses a single active workspace and an explicit system directory
selector. It does not add file editing, terminal, debugging, extensions, source
control operations, or language intelligence.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 22 LTS

**Primary Dependencies**: React 19, Vite 7, Fastify 5, Zod 4, Vitest, Playwright,
`@tanstack/react-query`, and a syntax highlighting package selected during
implementation from the supported-language requirements

**Storage**: Local filesystem only; no persistent application database in v1.
Workspace and open-document state are session state in the web client.

**Testing**: Vitest for unit and contract tests; Playwright for critical browser
journeys; fixture workspaces for deterministic filesystem and search scenarios.

**Target Platform**: macOS, Windows, and Linux desktop browsers connected to a local
Node.js Bridge service

**Project Type**: Web application with a local backend service

**Performance Goals**:

- Initial workspace tree is usable within 3 seconds for up to 5,000 visible entries.
- A first workspace-search result or explicit failure is visible within 3 seconds for
  up to 10,000 searchable text files under normal local conditions.
- Opening a normal-sized text file begins rendering within 1 second after the Bridge
  response is received.
- The viewer remains responsive while large directory and search responses are
  loading.

**Constraints**:

- Only one local user and one active workspace are supported in v1.
- The Bridge MUST restrict filesystem access to the selected workspace root.
- The Bridge MUST validate the browser Origin against an allowlist or require a local
  access token.
- File content MUST remain read-only and MUST NOT be persisted by the application.
- The UI and system error messages MUST use English.
- Large directory and search results MUST be bounded or incrementally loaded to avoid
  blocking the UI.

**Scale/Scope**: One active workspace, up to 5,000 visible file entries for explorer
interaction, up to 10,000 searchable text files, and one browser session.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|-----------|--------|----------|
| Specification-Driven Delivery | PASS | This plan traces to `spec.md`, defines design artifacts, and will generate `tasks.md` before implementation. |
| FSD Architecture and Boundary Ownership | PASS | The web source tree uses `shared`, `entities`, `features`, `widgets`, `pages`, and `app` with downward imports. |
| Type-Safe Full-Stack Contracts | PASS | TypeScript is used across client and Bridge; contracts are documented in `contracts/workspace-api.md` and represented from one shared package. |
| Verification and Observable Behavior | PASS | Unit, contract, integration, and browser journey checks are included in the validation strategy. |
| Minimal Complexity and Secure Defaults | PASS | One local Bridge, no database, no editing, and workspace-root enforcement keep the design bounded. |

No gate violations require complexity tracking.

## Phase 0: Research Decisions

Research findings are recorded in [research.md](./research.md). The key decisions are:

1. Use a local Node.js Bridge for filesystem access instead of relying on browser-only
   file handles, so workspace search and consistent error handling are possible.
2. Use a REST-style JSON contract for the small synchronous API surface; use bounded
   responses and cancellation rather than introducing a streaming protocol in v1.
3. Use a client-side session store for open documents and selection state; the Bridge
   remains stateless except for the active workspace root associated with the session.
4. Render large text files through a bounded viewport strategy and preserve line
   mapping as a first-class viewer concern.

## Phase 1: Design

The design artifacts are:

- [data-model.md](./data-model.md): workspace, file tree, document, viewer, and search
  state models and transitions.
- [contracts/workspace-api.md](./contracts/workspace-api.md): versioned Bridge API,
  error envelope, security rules, and response bounds.
- [quickstart.md](./quickstart.md): fixture-based validation scenarios for the primary
  user journeys and failure states.

### Architecture

```text
Browser
┌──────────────────────────────────────────────────────────────┐
│ React web client                                              │
│ app → pages → widgets → features → entities → shared          │
│                                                              │
│ FSD slices: workspace, file, document, search                 │
└──────────────────────────────┬───────────────────────────────┘
                               │ HTTP JSON / versioned contract
                               ▼
┌──────────────────────────────────────────────────────────────┐
│ Node.js local Bridge                                          │
│ transport → application → domain → infrastructure             │
│                                                              │
│ origin/token guard → workspace root guard → filesystem/search │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
                       Selected local workspace
```

### Frontend Responsibilities

- `app`: application bootstrap, routing, global providers, and Bridge client setup.
- `pages`: code viewer page composition and page-level loading/error boundaries.
- `widgets`: explorer panel, editor shell, open-document tabs, and search panel.
- `features`: open workspace, open file, switch document, search in file, and search
  workspace user actions.
- `entities`: workspace, file node, open document, viewer content, and search result
  models plus their public APIs.
- `shared`: UI primitives, HTTP client, error normalization, configuration, and
  reusable formatting utilities.

### Bridge Responsibilities

- Accept a workspace root selected by the user and return a normalized workspace
  identity.
- Return bounded directory children and file metadata.
- Read text file content with size and encoding guards.
- Perform literal, case-insensitive-by-default search with bounded result counts.
- Apply a transparent visibility policy: show all readable entries, including hidden
  entries, and treat unknown text formats as plain text; exclude only entries that
  cannot be safely read or are explicitly rejected by the host policy.
- Reject path traversal, symlink escapes, unauthorized Origins, and invalid input.
- Return stable English-safe error codes and user-facing messages through the shared
  error envelope.

### Request Flow

1. User selects a directory through the system directory selector.
2. The client sends the selected directory reference to the Bridge.
3. The Bridge validates origin/token, normalizes the root, and establishes the session
   workspace.
4. The client requests the root tree and renders loading, success, or failure state.
5. Selecting a file triggers a bounded content request; the client stores an
   `OpenDocument` and renders `ViewerContent`.
6. Search requests are scoped to the active workspace or active document and return
   bounded, navigable results.

### Constitution Re-check After Design

| Principle | Status | Post-design evidence |
|-----------|--------|----------------------|
| Specification-Driven Delivery | PASS | Every design artifact maps to the approved scenarios, requirements, or success criteria. |
| FSD Architecture and Boundary Ownership | PASS | UI composition, user actions, domain entities, and shared infrastructure have explicit layer ownership. |
| Type-Safe Full-Stack Contracts | PASS | The Bridge contract is versioned, JSON-shaped, and intended for shared TypeScript types. |
| Verification and Observable Behavior | PASS | Quickstart scenarios and the planned Vitest/Playwright coverage cover primary and failure flows. |
| Minimal Complexity and Secure Defaults | PASS | No database or persistent workspace state is introduced; path and Origin controls are mandatory. |

## Project Structure

### Documentation (this feature)

```text
specs/001-code-viewer/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── workspace-api.md
├── checklists/
│   └── requirements.md
└── tasks.md                 # Created by /speckit-tasks
```

### Source Code (repository root)

```text
apps/
├── web/
│   ├── src/
│   │   ├── app/
│   │   ├── pages/
│   │   ├── widgets/
│   │   ├── features/
│   │   ├── entities/
│   │   └── shared/
│   └── tests/
└── bridge/
    ├── src/
    │   ├── transport/
    │   ├── application/
    │   ├── domain/
    │   └── infrastructure/
    └── tests/
packages/
└── contracts/
    └── src/
tests/
├── fixtures/
└── e2e/
```

**Structure Decision**: Use a small pnpm workspace with separate `apps/web` and
`apps/bridge` applications plus a `packages/contracts` package. The web application
uses FSD layers; the Bridge uses transport/application/domain/infrastructure
separation required by the constitution. Shared contract types live in
`packages/contracts` and are consumed by both applications.

## Complexity Tracking

No constitution violations or unnecessary complexity are introduced.
