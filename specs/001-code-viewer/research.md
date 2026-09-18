# Research: VS Code-like Code Viewer

**Feature**: [spec.md](./spec.md)
**Date**: 2026-09-18

## Decision 1: Use a Local Node.js Bridge for Workspace Access

**Decision**: Use a local Node.js Bridge to own workspace selection, directory
enumeration, text-file reads, and workspace search.

**Rationale**:

- The feature requires recursive workspace search, bounded responses, consistent error
  handling, and path validation.
- A Bridge keeps local filesystem access out of React components and preserves the
  FSD boundary between UI and infrastructure.
- The existing project context already uses a local Bridge architecture, so this
  matches the repository's operating model.

**Alternatives considered**:

- Browser-only File System Access API: rejected as the sole access layer because
  browser support and permission semantics vary, and recursive search would be harder
  to bound consistently.
- Electron or another desktop shell: rejected for v1 because it adds packaging and
  distribution complexity that the read-only web viewer does not require.

## Decision 2: Use Versioned JSON HTTP Contracts

**Decision**: Expose a small versioned JSON HTTP API under `/api/v1/workspaces` and
`/api/v1/search`.

**Rationale**:

- The feature has request/response operations rather than a continuous event stream.
- JSON contracts are easy to inspect, mock, validate, and share between TypeScript
  applications.
- Versioning creates an explicit boundary for future changes to file and search
  behavior.

**Alternatives considered**:

- WebSocket transport: rejected for v1 because workspace listing, file reads, and
  bounded search do not require bidirectional streaming.
- GraphQL: rejected because the surface is small and does not need client-defined
  query composition.

## Decision 3: Keep Workspace and Open-Document State in the Client Session

**Decision**: Keep the selected workspace, expanded folders, open documents, active
  document, and search panel state in client memory. The Bridge keeps only the
  server-side session root needed to authorize subsequent requests.

**Rationale**:

- The specification targets one local user, one active workspace, and read-only
  behavior.
- No database or restart persistence is required for the first version.
- Separating view state from filesystem operations keeps the Bridge stateless enough
  to test and avoids coupling UI navigation to server storage.

**Alternatives considered**:

- Persist workspace and tabs across restarts: rejected as out of scope for v1.
- Store all tree and document state on the Bridge: rejected because it increases
  synchronization and lifecycle complexity without user value.

## Decision 4: Literal Search with Bounded Results

**Decision**: Search uses literal text matching, case-insensitive by default, with an
  explicit scope (`document` or `workspace`) and bounded result counts. Regex search,
  replacement, and language-aware symbol search are out of scope.

**Rationale**:

- Literal search is predictable for a first code viewer and avoids regex error
  handling and denial-of-service risks.
- Bounded results protect the Bridge and browser from very large responses.
- The contract can add regex or symbol search later without changing the basic result
  entity.

**Alternatives considered**:

- Regex-first search: rejected because it adds syntax errors, escaping behavior, and
  performance risks before the core viewer is validated.
- Language-server symbol search: rejected because language intelligence is explicitly
  out of scope.

## Decision 5: Bounded Text Rendering and File Guards

**Decision**: Apply file size, encoding, and response-size guards before rendering.
  Rendered content must preserve line mapping, while large content uses a bounded
  viewport strategy selected during implementation.

**Rationale**:

- A code viewer must remain responsive for large files and large workspaces.
- Explicit guards produce actionable states for unsupported or unsafe inputs.
- Keeping line mapping in the viewer model allows scrolling and search navigation to
  remain consistent.

**Alternatives considered**:

- Load every file and every search result in full: rejected because it risks browser
  stalls and makes the stated scale targets unreliable.
- Convert all files to a server-side index: rejected because it introduces
  persistence, invalidation, and indexing complexity outside v1.

## Decision 6: Transparent Workspace Visibility

**Decision**: Show every workspace entry that the user is permitted to read,
including hidden entries. Treat unknown text formats as plain text and exclude only
unreadable, unsafe, or explicitly host-rejected entries.

**Rationale**:

- A read-only inspection tool should not silently hide files that may be relevant to
  understanding a project.
- This keeps explorer and search behavior predictable and makes the exclusion reason
  visible when an entry cannot be shown.
- A future user-configurable exclusion policy can be added without changing the
  `FileNode` visibility model.

**Alternatives considered**:

- Hide hidden files and common generated directories by default: rejected for v1
  because it can conceal configuration or generated artifacts the user needs to inspect.
- Make visibility fully configurable immediately: rejected because it adds settings
  and policy management before the core viewer workflow is validated.
