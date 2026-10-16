# Application Specification and Change Workflow

## Ownership boundaries

Planning is centralized under `apps/<app>`, with an independent store for each application. See [AGENTS.md](../AGENTS.md) for repository rules, [README.md](../README.md) for the application index, and [Commit Conventions](commits.md) for required application scopes. Write maintained documentation and planning artifacts in English.

| Artifact | Location and responsibility |
| --- | --- |
| Canonical specification | `apps/<app>/openspec/specs/<app>/spec.md`; complete current accepted application behavior |
| Active change | `apps/<app>/openspec/changes/<change-id>/`; a proposed behavior change and its implementation plan |
| Proposal | Motivation, scope, non-goals, implementation repositories, and dependencies |
| Delta specification | `changes/<change-id>/specs/<app>/spec.md`; additions, modifications, removals, or renames relative to the canonical specification |
| Design | Contracts, repository responsibilities, compatibility, sequencing, and rollback |
| Tasks | Repository-specific work, verification, and integration acceptance |
| Archive | The application's `changes/archive/YYYY-MM-DD-<change-id>/`; historical records of completed changes |
| Source code and tests | The explicitly selected external implementation repositories |

Start with one canonical specification per application. The file may be absent until the first change is completed and archived. Do not turn illustrative requirements into approved behavior, copy the entire canonical specification into implementation repositories, or split small features into separate specs prematurely.

## Registering stores and connecting implementation repositories

1. Install the verified CLI version: `npm install -g @fission-ai/openspec@1.14.2`.
2. Clone the central repository and register the required application directories from its root:

   ```bash
   openspec store register ./apps/chat
   openspec store register ./apps/note
   openspec store list --json
   ```

3. Create a pointer in the actual implementation repository. For Chat:

   ```yaml
   # openspec/config.yaml in the implementation repository
   store: creative-studio-chat
   ```

4. If the implementation repository already has `openspec/specs/` or `openspec/changes/`, inspect and migrate its planning into the correct central store. Resolve name collisions and baseline differences, review the migration, and only then remove the local planning directories. A real local planning root takes precedence over a store pointer.
5. Install Codex integration from the implementation repository root: `openspec init --tools codex`. For a valid config-only pointer repository, this preserves the pointer and installs integrations without creating local specs or changes. Do not pass `--language`; planning language is configured in the central application store.
6. Verify pointer resolution:

   ```bash
   openspec context --json
   openspec doctor --json
   ```

   `root.path` must identify the central checkout's `apps/chat` directory and `root.store_id` must be `creative-studio-chat`. Note uses `apps/note` and `creative-studio-note`.

Register stores separately on each machine. Do not commit registries or personal workset paths. Each store ID resolves to one checkout per machine; explicitly unregister the old location before registering another. All application directories in the central checkout share its current Git branch.

## Creating and reviewing an application change

The following commands use Chat's `add-streaming` as an example; they do not indicate an approved or existing product requirement.

Select the application explicitly from the central repository root:

```bash
openspec context --store creative-studio-chat --json
openspec new change add-streaming --store creative-studio-chat
openspec status --change add-streaming --store creative-studio-chat --json
```

`new change` creates only a scaffold. When using `$openspec-propose`, identify the store and change. Explicitly continue an existing scaffold instead of creating a duplicate. Follow `status` and `instructions` to produce the artifacts required by the selected schema.

The example's delta belongs in `apps/chat/openspec/changes/add-streaming/specs/chat/spec.md` and uses the standard sections:

- `ADDED Requirements`: new behavior. Only added requirements can create a new canonical specification.
- `MODIFIED Requirements`: the full revised version of an existing requirement, preserving scenarios that remain valid.
- `REMOVED Requirements`: deleted requirements, with their rationale and impact.
- `RENAMED Requirements`: renamed requirements with an explicit old-to-new mapping.

For a new canonical specification, provide `## Purpose` in the delta. Use `### Requirement:` and `#### Scenario:` headings. Initially represent the application's capabilities as requirements within the same spec file.

Proposals identify actual implementation repositories; each implementation task names its target repository. Mark unconfirmed repositories as such. Review behavior, failure cases, contracts, compatibility, and acceptance criteria, then validate:

```bash
openspec validate add-streaming --strict --store creative-studio-chat
```

Review planning through a central Git branch and PR. Record the planning commit before implementation handoff. Application design and planning commits require scope, for example `feat(chat): define streaming response behavior`; include `Change: creative-studio-chat/add-streaming` in the body when committing that change. Use Git to share later revisions. OpenSpec reads the local checkout and does not automatically pull or pin planning revisions.

## Implementing in application repositories

Start the apply session in the selected implementation repository and make the central checkout available to the agent. Supply the central AGENTS.md, application README, and relevant configuration constraints. Visibility of another directory does not authorize editing it.

Example instruction:

```text
Use openspec-apply-change for add-streaming in store creative-studio-chat.
Confirm the planning root and revision, then read the change and application rules.
Execute only tasks assigned to the selected implementation repository.
Write source code and tests there. After verification, update the central tasks
and record the implementation PR, verification commands, and results.
```

Multiple implementation repositories share the same central change. Do not create duplicate local implementation changes. OpenSpec does not route tasks by repository; every apply session must have an explicit repository scope.

Implementation PRs record the application, store ID, central change ID, and planning commit. The central change records implementation PRs, verification results, and remaining work. For behavior that has not yet been synchronized, read the active change as well as the canonical specification.

Once the canonical application specification exists, read it and the active change with:

```bash
openspec show chat --type spec --store creative-studio-chat
openspec show add-streaming --store creative-studio-chat
```

## Acceptance, synchronization, and archival

1. Verify planning completeness, actual implementation completion, tests, integration results, and linked PRs. Planning completion in `status` does not establish implementation completion; strict validation does not test product code.
2. Check off completed tasks and record implementation PRs and verification evidence. Do not mark unfinished work complete.
3. Use `$openspec-archive-change` with the explicit application store and change. Follow its checks, reconcile the delta with the current canonical specification, synchronize and verify, then archive.
4. Once completion is confirmed, the CLI also provides a default synchronization-and-archive path:

   ```bash
   openspec archive add-streaming --store creative-studio-chat
   openspec validate --all --strict --store creative-studio-chat
   openspec validate --archived --store creative-studio-chat
   ```

5. Confirm that `apps/chat/openspec/specs/chat/spec.md` reflects the final behavior and that the change is in that application's archive. Commit and review the central updates using an application scope, for example `chore(chat): archive add-streaming`. Archival does not commit, push, merge implementation PRs, or deploy the application.

Do not skip specification synchronization for normal behavior changes. For tooling or documentation changes that permanently have no business-specification delta, the change metadata may declare `skip_specs: true` as supported by the CLI and schema. Do not use this to bypass incomplete behavior planning.

## Subsequent changes and cross-application coordination

- To refine an active change, use `$openspec-update-change`, keep its artifacts consistent, and review and validate again. The CLI command `openspec update` refreshes integrations, not business changes.
- For new or revised behavior after archival, create a new change instead of rewriting historical archives.
- If code violates an existing specification, fix and verify it in the implementation repository. The canonical specification need not change when the behavior contract remains the same.
- If concurrent changes modify the same requirement, reconcile them with the latest canonical specification before deciding archive order.
- If a requirement affects both Chat and Note, create a change in each store. Cross-reference their store/change IDs, planning revisions, dependencies, and joint acceptance criteria. A central PR may cover both applications, but archives are executed per store; there is no automatic cross-store transaction.
- Split independent application changes into separate scoped commits. For an inseparable multi-application change, use scope `apps`, list the affected application IDs in an `Apps:` body line, and reference applicable change IDs. See [Commit Conventions](commits.md).

## Adding an application

After confirming a new application ID, such as `calendar`, run from the central repository root:

```bash
openspec store setup creative-studio-calendar --path ./apps/calendar \
  --remote https://github.com/faxintan/creative-studio.git --no-init-git
```

`--no-init-git` prevents a nested Git repository and skips automatic commits. The command creates and registers the application store.

Then:

1. Add `apps/calendar/README.md` with the application description, owner, actual implementation repositories, store ID, canonical specification path, and setup instructions. Mark unknown details as unconfirmed.
2. Write an independent `openspec/config.yaml` based on the existing applications. Use `openspec/specs/calendar/spec.md` for the consolidated specification, specify English for planning artifacts, and include repository-specific task rules and apply/archive guidance. Configuration is not inherited from another application.
3. Update the root application index. Do not seed the canonical specification with illustrative product requirements.
4. Verify context, doctor output, and strict validation. Include empty-directory markers in Git.
5. Configure implementation repositories with only `store: creative-studio-calendar`, verify resolution, then start the first behavior change.
6. Commit application setup with its application ID as scope, for example `chore(calendar): initialize planning store`.

The remote in `store.yaml` identifies the central repository; it does not encode an automatic subdirectory registration procedure. Onboarding must say to clone the central repository and then register `apps/calendar`.

## Migrating from the root store

The previous root store was named `creative-studio`. Before this layout was introduced, the central root contained only initialization configuration and empty-directory markers, with no business specifications or changes. Application stores replaced that root planning structure.

After updating an existing checkout, run from the central repository root:

```bash
openspec store unregister creative-studio
openspec store register ./apps/chat
openspec store register ./apps/note
```

Unregister the old ID only if it exists on that machine. Unregistering removes registration, not repository files. If a global `defaultStore` or implementation pointer still names `creative-studio`, inspect it and clear the stale default or select the appropriate application store. Do not silently map every old pointer to Chat.

Do not run `openspec store remove creative-studio`: it attempts to delete the entire registered directory. If another branch or checkout has real business planning, classify, migrate, validate, and review it before removing the old layout.

Application stores are not independent Git roots. `store doctor` may report that fact; check Git state at the central repository root. Having no OpenSpec root at the repository root is intentional, so select an application for planning commands. The CLI neither aggregates application lists nor provides application-level access control.
