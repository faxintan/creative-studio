# creative-studio

A central planning repository for application specifications, designs, change plans, and archives. One Git repository contains an independent OpenSpec store for each application, using a monorepo-style directory layout. Application code and tests live in separate implementation repositories.

## Application index

| Application | Store ID | Planning root | Canonical specification (created after the first completed behavior change) | Status |
| --- | --- | --- | --- | --- |
| [Chat](apps/chat/README.md) | `creative-studio-chat` | `apps/chat/` | `apps/chat/openspec/specs/chat/spec.md` | Initialized; requirements not yet defined |
| [Note](apps/note/README.md) | `creative-studio-note` | `apps/note/` | `apps/note/openspec/specs/note/spec.md` | Initialized; requirements not yet defined |

Implementation repositories have not been selected. Record their actual URLs and responsibilities in the application README once confirmed. A store ID is a machine-local registration name, not a repository URL; each ID resolves to one application directory.

## Repository layout

```text
creative-studio/
├── AGENTS.md                    Repository operating rules
├── .agents/skills/              Shared Codex OpenSpec workflows
├── docs/
│   ├── workflow.md             Setup, planning, implementation, and archival
│   └── commits.md              Commit format and required application scopes
└── apps/
    ├── chat/
    │   ├── README.md            Application ownership, repositories, and setup
    │   ├── .openspec-store/store.yaml
    │   └── openspec/
    │       ├── config.yaml      Application planning rules
    │       ├── specs/           Canonical application specification
    │       └── changes/         Active changes and archive/
    └── note/                    Same structure as chat
```

The repository root is not a store and has no root-level `openspec/` directory. Application directories share this repository's Git history without nested Git repositories. Start with one canonical `spec.md` per application; split it only when document size or concurrent work warrants it.

## Local setup

This layout has been verified with OpenSpec `1.14.2`. Stores are a beta feature; check command and format compatibility before upgrading.

```bash
npm install -g @fission-ai/openspec@1.14.2
git clone https://github.com/faxintan/creative-studio.git
cd creative-studio
openspec store register ./apps/chat
openspec store register ./apps/note
openspec doctor --store creative-studio-chat
openspec doctor --store creative-studio-note
```

For an existing checkout, register only the applications you need. Registration is machine-local and is not committed. A global `defaultStore` is not required. For the previous root-store layout, see [migration instructions](docs/workflow.md#migrating-from-the-root-store).

Each implementation repository keeps only a store pointer in its OpenSpec directory. For Chat:

```yaml
# openspec/config.yaml in the implementation repository
store: creative-studio-chat
```

Note uses `store: creative-studio-note`. Implementation repositories keep no local `openspec/specs/` or `openspec/changes/` directories. Multiple implementation repositories may point to the same application store.

## Daily workflow

From the central repository root, select the application explicitly:

```bash
openspec list --store creative-studio-chat
openspec new change add-streaming --store creative-studio-chat
openspec status --change add-streaming --store creative-studio-chat
openspec validate add-streaming --strict --store creative-studio-chat
```

`new change` creates only a scaffold. Use Codex's `$openspec-propose` to produce the planning artifacts; explicitly continue the existing change if you already created its scaffold. Other core skills are `$openspec-explore`, `$openspec-apply-change`, `$openspec-update-change`, `$openspec-sync-specs`, and `$openspec-archive-change`. In the desktop app, select the skill from Skills and identify the application store.

The lifecycle is: select an application, create and review a change, implement in the assigned repositories, complete integration acceptance, synchronize specifications and archive the change, then commit the central updates. See the [management workflow](docs/workflow.md); agents must read [AGENTS.md](AGENTS.md) before operating.

## Language and commits

Use precise English for maintained documentation, specifications, planning artifacts, and commit messages. Application-related commits require an application scope, including design and specification changes: `feat(chat): define streaming response behavior`. See [Commit Conventions](docs/commits.md) for documentation-only changes, archives, and multi-application commits.

OpenSpec does not dispatch cross-repository tasks, aggregate all applications, synchronize Git repositories, or deploy applications. Application stores isolate planning roots; repository access is controlled by the Git hosting platform.
