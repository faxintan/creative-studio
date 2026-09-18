# Workspace Bridge API Contract

**Version**: `v1`
**Transport**: HTTP JSON
**Base path**: `/api/v1`
**Consumer**: React web client
**Provider**: Node.js local Bridge

## Security Contract

- The Bridge MUST accept requests only from the configured local web Origin or a
  request carrying the configured local access token.
- The Bridge MUST reject paths that escape the selected workspace root after
  normalization.
- The client MUST send workspace-relative paths after workspace creation; arbitrary
  absolute paths are invalid.
- Error responses MUST NOT expose unrestricted host paths, secrets, or stack traces.

## Common Error Envelope

```json
{
  "error": {
    "code": "WORKSPACE_NOT_FOUND",
    "message": "The selected workspace is not available.",
    "retryable": false
  }
}
```

`code` is stable for programmatic handling. `message` is safe to display directly to
the user and MUST be written in English. `retryable` indicates whether retrying the
same request can reasonably succeed.

## POST `/workspaces`

Creates a session workspace from the directory selected by the user.

**Request**:

```json
{
  "directoryReference": "opaque-local-directory-reference"
}
```

**Rules**:

- `directoryReference` is interpreted only by the local Bridge integration.
- The resolved directory MUST exist, be readable, and be a directory.
- The Bridge returns an opaque `workspaceId`; the client does not receive an
  unrestricted filesystem path.

**Response `201`**:

```json
{
  "workspace": {
    "workspaceId": "ws_123",
    "displayName": "creative-studio",
    "status": "ready"
  }
}
```

**Errors**:

- `400 INVALID_DIRECTORY_REFERENCE`
- `403 ORIGIN_NOT_ALLOWED`
- `404 WORKSPACE_NOT_FOUND`
- `409 WORKSPACE_NOT_READABLE`

## GET `/workspaces/{workspaceId}/tree`

Returns a bounded list of children for the workspace root or a directory.

**Query**:

| Parameter | Required | Description |
|-----------|----------|-------------|
| `path` | No | Workspace-relative directory path; defaults to root |
| `cursor` | No | Continuation cursor for bounded child results |
| `limit` | No | Requested page size; Bridge clamps to a safe maximum |

**Response `200`**:

```json
{
  "workspaceId": "ws_123",
  "path": "src",
  "entries": [
    {
      "nodeId": "node_456",
      "name": "app",
      "relativePath": "src/app",
      "kind": "directory",
      "visibility": "visible",
      "availability": "readable",
      "hasChildren": true
    }
  ],
  "nextCursor": null
}
```

**Errors**:

- `400 INVALID_RELATIVE_PATH`
- `404 WORKSPACE_NOT_FOUND`
- `404 DIRECTORY_NOT_FOUND`
- `409 DIRECTORY_NOT_READABLE`

## GET `/workspaces/{workspaceId}/files/content`

Returns bounded text content for one workspace-relative file.

**Query**:

| Parameter | Required | Description |
|-----------|----------|-------------|
| `path` | Yes | Workspace-relative file path |
| `maxBytes` | No | Requested maximum; Bridge clamps to a safe maximum |

**Response `200`**:

```json
{
  "workspaceId": "ws_123",
  "relativePath": "src/app.ts",
  "contentType": "text",
  "languageId": "typescript",
  "encoding": "utf-8",
  "lineEnding": "lf",
  "content": "export const app = true;\n"
}
```

**Errors**:

- `400 INVALID_RELATIVE_PATH`
- `404 FILE_NOT_FOUND`
- `409 FILE_NOT_READABLE`
- `415 UNSUPPORTED_FILE_TYPE`
- `413 FILE_TOO_LARGE`

## POST `/workspaces/{workspaceId}/search`

Searches one active document or the workspace.

**Request**:

```json
{
  "query": "workspace",
  "scope": "workspace",
  "path": null,
  "caseSensitive": false,
  "includeHidden": true,
  "limit": 200
}
```

**Response `200`**:

```json
{
  "workspaceId": "ws_123",
  "query": "workspace",
  "scope": "workspace",
  "truncated": false,
  "results": [
    {
      "resultId": "result_1",
      "relativePath": "src/app.ts",
      "line": 4,
      "column": 12,
      "preview": "const workspace = openWorkspace();",
      "matchStart": 6,
      "matchLength": 9
    }
  ]
}
```

**Rules**:

- Empty queries return `200` with an empty result list and `truncated=false`.
- Matching is literal and case-insensitive unless `caseSensitive=true`.
- Results and preview lengths are bounded.
- A search failure MUST NOT invalidate the active workspace or open document.

**Errors**:

- `400 INVALID_SEARCH_QUERY`
- `404 WORKSPACE_NOT_FOUND`
- `409 SEARCH_UNAVAILABLE`
- `413 SEARCH_QUERY_TOO_LARGE`
