# Data Model: VS Code-like Code Viewer

**Feature**: [spec.md](./spec.md)

## Workspace

Represents the single local project root selected by the user.

| Field | Type | Rules |
|-------|------|-------|
| `workspaceId` | opaque string | Required; generated for the current Bridge session |
| `displayName` | string | Required; user-visible root name |
| `rootReference` | opaque string | Required; never expose unrestricted server paths to the client |
| `status` | `opening \| ready \| error` | Required |
| `errorCode` | string or null | Required only when `status=error` |

**Relationships**:

- Has many `FileNode` records.
- Is the scope for `workspace` `SearchQuery` records.
- Owns the server-side root guard for the current local session.

**Validation**:

- The selected root MUST be a readable directory.
- The Bridge MUST normalize the root before storing it.
- Every subsequent path MUST resolve inside the normalized root.

## FileNode

Represents one visible folder or file in the workspace tree.

| Field | Type | Rules |
|-------|------|-------|
| `nodeId` | opaque string | Stable for the current workspace session |
| `parentId` | opaque string or null | Null only for the workspace root |
| `name` | string | Required; display name only |
| `relativePath` | string | Required; normalized relative path |
| `kind` | `directory \| file` | Required |
| `contentType` | `text \| binary \| unknown` | Required for files |
| `visibility` | `visible \| hidden \| excluded` | Required |
| `availability` | `readable \| unreadable \| missing` | Required |
| `hasChildren` | boolean | Required for directories |

**State transitions**:

```text
visible/readable → missing       (file changes after tree load)
visible/readable → unreadable    (permissions change)
directory/collapsed → expanded
directory/expanded → collapsed
```

**Rules**:

- The tree returns only entries allowed by the configured visibility policy.
- Paths are relative to the workspace root and are never accepted as arbitrary
  absolute paths from the client.
- Directory children are bounded and may be loaded on demand.

## OpenDocument

Represents a file currently shown in the open-document area.

| Field | Type | Rules |
|-------|------|-------|
| `documentId` | opaque string | Derived from workspace and relative path |
| `nodeId` | opaque string | Must reference a file `FileNode` |
| `relativePath` | string | Required; canonical identity |
| `title` | string | Required; file name |
| `active` | boolean | At most one open document is active |
| `contentState` | `idle \| loading \| ready \| empty \| error` | Required |
| `lastErrorCode` | string or null | Required only for error state |

**State transitions**:

```text
not-open → loading → ready
not-open → loading → empty
not-open → loading → error
ready → active
active → ready
active → closed
```

**Rules**:

- Opening the same canonical relative path twice MUST activate the existing document
  instead of creating a duplicate tab.
- Closing the active document selects a predictable remaining document or the empty
  viewer state.
- The model contains no editable buffer or dirty state in v1.

## ViewerContent

Represents the renderable content for an open document.

| Field | Type | Rules |
|-------|------|-------|
| `documentId` | opaque string | Must match the active `OpenDocument` |
| `text` | string | Required only for `ready`; never persisted |
| `lineCount` | positive integer or 0 | Must match line mapping |
| `languageId` | string | Recognized language or `plain-text` |
| `encoding` | string | Resolved encoding label |
| `lineEnding` | `lf \| crlf \| cr \| mixed \| unknown` | Informational |
| `renderState` | `loading \| ready \| empty \| error` | Required |

**Rules**:

- Line numbers are derived from the content without changing line boundaries.
- Binary and unsupported content MUST not be rendered as arbitrary decoded text.
- Empty text uses `renderState=empty` and `lineCount=0`.

## SearchQuery

Represents one in-file or workspace search request.

| Field | Type | Rules |
|-------|------|-------|
| `query` | string | Required; bounded length; literal matching |
| `scope` | `document \| workspace` | Required |
| `documentId` | opaque string or null | Required for document scope |
| `caseSensitive` | boolean | Defaults to false |
| `includeHidden` | boolean | Defaults to the workspace visibility policy |
| `status` | `idle \| searching \| complete \| error` | Required |

**Rules**:

- Empty queries do not trigger a search and show the idle state.
- Search requests are cancellable on the client; stale results MUST NOT replace
  newer results.
- Workspace search uses the same visibility and file-read guards as the explorer.

## SearchResult

Represents a single match returned by a search.

| Field | Type | Rules |
|-------|------|-------|
| `resultId` | opaque string | Unique within one search response |
| `relativePath` | string | Required; workspace-relative |
| `line` | positive integer | Required; one-based |
| `column` | positive integer | Required; one-based |
| `preview` | string | Bounded context line |
| `matchStart` | non-negative integer | Within `preview` |
| `matchLength` | positive integer | Within `preview` |

**Relationships**:

- Belongs to one `SearchQuery`.
- Resolves to one `FileNode`.
- Selecting a result opens or activates its `OpenDocument` and positions the viewer at
  `line` and `column`.
