# Quickstart Validation: VS Code-like Code Viewer

This guide validates the feature through a local fixture workspace and the browser
application. It is intentionally a validation guide; implementation details belong in
`tasks.md`.

## Prerequisites

- Node.js 22 LTS
- pnpm 10+
- A desktop browser supported by the project
- A local fixture workspace created at `tests/fixtures/code-viewer-workspace`

The fixture workspace must contain:

```text
code-viewer-workspace/
├── README.md
├── empty.txt
├── src/
│   ├── app.ts
│   ├── helpers.ts
│   └── nested/
│       └── config.json
├── docs/
│   └── guide.md
└── unreadable.txt       # enabled only in permission-error scenarios
```

## Start the Applications

```bash
pnpm install
pnpm dev
```

Expected result: the React web client and local Node.js Bridge start on their
configured local ports, and the browser can reach the code viewer page.

## Scenario 1: Open a Workspace and File

1. Open the code viewer page.
2. Use the system directory selector to choose
   `tests/fixtures/code-viewer-workspace`.
3. Confirm that `README.md`, `src`, and `docs` appear in the explorer.
4. Open `src/app.ts`.

Expected result:

- The file appears in the open-document area.
- The content is readable with line numbers.
- The active file is visually identified in both the explorer and tab area.

## Scenario 2: Navigate and Switch Documents

1. Expand `src` and then `nested`.
2. Open `src/helpers.ts` and `nested/config.json`.
3. Switch between the opened documents.
4. Close the active document.

Expected result:

- Folder expansion preserves tree context.
- Only one document is active at a time.
- Closing the active document activates a predictable remaining document or an empty
  viewer state.

## Scenario 3: Readability and File States

1. Open `empty.txt`.
2. Open `config.json`.
3. Open a file with an unknown extension containing plain text.
4. Trigger the unreadable-file fixture scenario when the environment permits it.

Expected result:

- The empty file shows an intentional empty state.
- Recognized content receives syntax-aware visual distinctions.
- Unknown text remains readable through a plain-text fallback.
- Unreadable or unsupported content shows an actionable English message while the
  explorer remains usable.

## Scenario 4: Search

1. Search for `workspace` within the active file.
2. Move between matches and confirm the count and current match indicator.
3. Search for `workspace` across the workspace.
4. Select a result in `src/app.ts`.
5. Search for a term that does not exist.

Expected result:

- In-file results show count, current match, and navigation.
- Workspace results are grouped by file and show line locations.
- Selecting a result opens or activates the file and reveals the match.
- Zero results do not replace the current readable file.

## Scenario 5: Scale and Narrow Viewport

1. Generate a fixture with at least 5,000 visible entries.
2. Generate a fixture with at least 10,000 searchable text files.
3. Open the workspace and run a workspace search.
4. Repeat the primary navigation flow at the supported narrow viewport width.

Expected result:

- The explorer remains navigable and exposes loading or failure states.
- Search shows an initial result or explicit failure within the target time.
- Explorer, tabs, search controls, and viewer remain usable without incoherent overlap.

## Traceability

| Scenario | Specification coverage |
|----------|------------------------|
| Open workspace and file | US1, FR-001, FR-003, FR-004, SC-001 |
| Navigate and switch | US2, FR-002, FR-005, FR-014, SC-002 |
| Readability and states | US3, FR-006 through FR-009, SC-006, SC-007 |
| Search | US4, FR-010 through FR-013, SC-005 |
| Scale and narrow viewport | FR-008, FR-015, SC-004, SC-005 |
