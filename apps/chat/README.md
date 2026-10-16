# Chat

The central planning store for the Chat application. The store is initialized; product requirements, ownership, and actual implementation repositories remain unconfirmed. There is no canonical business specification or active change yet.

| Item | Convention |
| --- | --- |
| Store ID | `creative-studio-chat` |
| Planning root | `apps/chat/` |
| Consolidated canonical specification | `openspec/specs/chat/spec.md`, created after the first completed behavior change |
| Spec ID | `chat` |
| Implementation repositories | Unconfirmed; record actual repository URLs and responsibilities here once selected |
| Repository rules | [AGENTS.md](../../AGENTS.md) |
| Management workflow | [workflow.md](../../docs/workflow.md) |
| Commit conventions | [commits.md](../../docs/commits.md); application scope `chat` is required |

## Registration and planning

Register from the central repository root:

```bash
openspec store register ./apps/chat
openspec doctor --store creative-studio-chat
openspec list --store creative-studio-chat
openspec new change add-chat-foundation --store creative-studio-chat
```

`new change` creates only a scaffold; produce the proposal, delta specification, design, and task plan next. Once the canonical specification exists, read it with `openspec show chat --type spec --store creative-studio-chat`. Its absence during initialization is expected.

Write documentation and planning artifacts in English. Application-related commits, including design, specification, documentation, and archive updates, must use scope `chat`, for example `feat(chat): define application behavior` or `docs(chat): clarify acceptance scenarios`.

## Connecting implementation repositories

In each confirmed Chat implementation repository, keep only this `openspec/config.yaml`:

```yaml
store: creative-studio-chat
```

Planning artifacts remain in the central `apps/chat/openspec/changes/` directory. Do not create local specification or change directories in implementation repositories. Migrate existing planning using the management workflow before enabling the pointer. Store pointers do not dispatch tasks; name each implementation repository's responsibilities in the central task plan.

Implementation sessions need access to both the central checkout and the selected code repository, along with the central AGENTS.md, this README, and application configuration. The remote in `store.yaml` is the central Git repository URL. After cloning, register `apps/chat`, not the repository root.
