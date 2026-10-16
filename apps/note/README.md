# Note

Note 应用的集中规划 store。当前已初始化，产品需求、负责人和实际实现仓库待确认；尚无业务主规范或活跃 change。

| 项目 | 约定 |
| --- | --- |
| Store ID | `creative-studio-note` |
| 规划根目录 | `apps/note/` |
| 集中式主规范 | `openspec/specs/note/spec.md`（首个业务变更完成后生成） |
| Spec ID | `note` |
| 实现仓库 | 待确认；后续在此登记真实仓库 URL 和职责 |
| 全局约定 | [AGENTS.md](../../AGENTS.md) |
| 管理流程 | [workflow.md](../../docs/workflow.md) |

## 注册和操作

从中央仓库根目录注册：

```bash
openspec store register ./apps/note
openspec doctor --store creative-studio-note
openspec list --store creative-studio-note
openspec new change add-note-foundation --store creative-studio-note
```

`new change` 仅创建骨架，随后补齐 proposal、specs、design 和 tasks。主规范出现后可运行 `openspec show note --type spec --store creative-studio-note`；初始化阶段不存在主规范是正常状态。

## 实现仓库接入

在已明确的 note 实现仓库中仅保留以下 `openspec/config.yaml`：

```yaml
store: creative-studio-note
```

规划产物仍写入中央 `apps/note/openspec/changes/`。不要创建实现仓库本地的 specs/changes；如有已有规划，先按管理流程迁移。指针不自动分派任务，多个仓库接入时必须在中央 tasks 中明确职责。

实施会话需能访问中央 checkout 与目标代码仓库，并读取中央 AGENTS.md、本 README 和应用配置。`store.yaml` 的 remote 是整个中央 Git 仓库 URL，克隆后仍需注册 `apps/note` 子目录，不能直接注册仓库根目录。
