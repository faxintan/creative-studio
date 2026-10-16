# Repository Operating Rules

## Repository responsibilities

- This repository owns application specifications, proposals, designs, task plans, review evidence, and change archives. Application source code, tests, runtime configuration, and build output belong in explicitly selected implementation repositories.
- Read the root application index, the target application's README, and its `openspec/config.yaml` before application work.
- `apps/chat` is store `creative-studio-chat`; `apps/note` is store `creative-studio-note`. The repository root is not an OpenSpec store.
- Write maintained documentation, specifications, planning artifacts, and commit messages in precise English. Preserve technical identifiers and OpenSpec's required headings and keywords.

## Selecting a planning root

- Identify the application before writing planning artifacts. Ask when it is ambiguous; do not silently choose an application or create a root-level `openspec/` directory.
- In this central repository, always pass the application store to commands that support `--store`. First run `openspec context --store <store-id> --json` and verify that `root.path` is the intended application directory.
- Register missing stores using the application's README. Diagnose registration failures rather than initializing the repository root or setting a global `defaultStore` as a workaround.
- For integration maintenance commands such as `init` and `update`, and commands without `--store`, check the installed CLI's help and explicitly select the application directory. Never run `openspec init` at the central repository root. Shared skills in `.agents/skills/` do not make that directory a store.
- Each application has an independent OpenSpec root. Configuration is not automatically inherited from the repository root or sibling applications.

## Specifications and changes

- Initially keep each application's canonical specification in `apps/<app>/openspec/specs/<app>/spec.md`. Do not invent requirements or split small capabilities into separate files before a real need exists.
- Canonical specifications describe the current accepted behavior using `## Purpose`, `## Requirements`, `### Requirement:`, and `#### Scenario:`. Requirements must use explicit terms such as SHALL or MUST and have verifiable scenarios.
- Create a change before adding or changing behavior. Use ADDED, MODIFIED, REMOVED, and RENAMED deltas as appropriate. Preserve the application's spec ID; use ADDED requirements to create its first canonical specification.
- Proposals identify the application, actual implementation repositories, scope, non-goals, planning revision, and cross-repository dependencies. Mark unknown repositories as unconfirmed instead of inventing names or URLs.
- Designs describe contracts, compatibility, implementation order, failure handling, and rollback. Implementation tasks name their target repository and include repository tests and integration acceptance checks.
- Completed planning artifacts do not prove implementation completion. Check off a task only after its work is complete and verification evidence is available.
- Keep active-change artifacts consistent when requirements evolve. Create a new change for behavior changes after archival. Reconcile concurrent changes against the latest canonical specification before archiving.

## Implementation and coordination

- Implementation repositories use `store: creative-studio-<app>` and keep no local specification or change directories. Inspect and migrate existing local planning before removing it to enable a pointer.
- A store pointer selects the planning location. It neither dispatches tasks nor authorizes edits to every implementation repository. Identify the current target repository and execute only its assigned tasks.
- Make the application store and selected implementation repository available to the agent. Supply this file, the application README, and relevant application configuration to implementation sessions; this AGENTS.md is not automatically applied outside the central repository.
- Link central changes and implementation PRs using the change ID, planning commit, implementation PR, and verification results. Use CLI-returned `planningHome`, `changeRoot`, and `actionContext` to verify paths and scope.
- For cross-application work, create linked changes in the affected application stores and document dependencies and acceptance order. Applications share a Git checkout and branch; store separation is not a branch or access-control boundary.

## Validation and archival

- Run strict validation for the affected store after planning changes. Check every affected application when shared rules change. An empty store's zero-item validation is not product acceptance evidence.
- Before archival, verify planning completeness, task completion, implementation PR status, tests, and integration evidence. Consider the application's archive guidance.
- For normal behavior changes, merge deltas into that application's canonical specification before moving the change to its archive. Do not use `--skip-specs` to bypass a merge problem or rewrite historical archives.
- Agent-driven archival must read current instructions and resolved paths and follow the official archive/sync workflows. CLI validation does not replace implementation acceptance.
- Context, rules, and operation guidance guide agent behavior; they are not an enforcement mechanism for code correctness, permissions, Git merges, or deployment.

## Commits

- Follow [Commit Conventions](docs/commits.md). Every commit that changes application planning, design, specifications, configuration, documentation, tasks, or archives MUST include an application scope.
- For one application, use its directory ID: `feat(chat): define streaming response behavior` or `docs(note): clarify acceptance scenarios`. An unscoped subject or the wrong application scope is invalid even for documentation-only changes under `apps/<app>/`.
- Split independent application changes into separate commits. For an inseparable multi-application change, use scope `apps` and list the affected IDs in an `Apps: chat, note` body line.
- Shared repository-only changes may use scope `repo`. Do not use `repo` to conceal application changes. Reference existing application change IDs in the body when applicable.

## Git and maintenance

- All applications share this Git repository. Do not create nested `.git` directories. Preserve existing user changes; commit and push only when authorized, and do not remove unknown files.
- Keep `.gitkeep` files so empty specification and archive directories survive cloning. Do not commit machine registries, absolute workset paths, or temporary validation changes.
- Add applications using `docs/workflow.md`, update the root index, and provide a separate store identity, configuration, and README.
- OpenSpec owns `.agents/skills/openspec-*` and `.openspec-target`. Keep custom instructions in this file, application READMEs, and application configuration.
