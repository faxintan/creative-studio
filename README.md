# creative-studio

集中管理不同应用的规范、设计、变更计划和归档。采用 monorepo 式目录组织：一个 Git 仓库，按应用划分独立 OpenSpec store，实际代码和测试位于应用实现仓库。

## 应用索引

| 应用 | Store ID | 规划根目录 | 主规范路径（首个业务变更完成后生成） | 状态 |
| --- | --- | --- | --- | --- |
| [Chat](apps/chat/README.md) | `creative-studio-chat` | `apps/chat/` | `apps/chat/openspec/specs/chat/spec.md` | 已初始化，需求待定义 |
| [Note](apps/note/README.md) | `creative-studio-note` | `apps/note/` | `apps/note/openspec/specs/note/spec.md` | 已初始化，需求待定义 |

应用实现仓库尚未指定，确认后登记在应用 README 中。Store ID 是本机注册名称，不是仓库 URL；每个 ID 对应一个应用目录。

## 目录结构

```text
creative-studio/
├── AGENTS.md                    全仓库操作约定
├── .agents/skills/              共用 Codex OpenSpec 工作流
├── docs/workflow.md             接入、规划、实施、归档和新增应用流程
└── apps/
    ├── chat/
    │   ├── README.md            应用说明、实现仓库与接入方式
    │   ├── .openspec-store/store.yaml
    │   └── openspec/
    │       ├── config.yaml      应用规划规则
    │       ├── specs/           应用集中式主规范
    │       └── changes/         活跃变更与 archive/
    └── note/                    与 chat 相同的结构
```

仓库根目录不再是 OpenSpec store，不保留根级 `openspec/`。各应用共用此仓库的 Git 历史，不创建嵌套 `.git`。规范先按应用集中在一个 `spec.md` 中管理，仅在内容规模或并行协作确有需要时拆分。

## 本机接入

当前结构使用 OpenSpec `1.14.2` 验证。Stores 为 beta 功能，升级前检查命令和格式兼容性。

```bash
npm install -g @fission-ai/openspec@1.14.2
git clone https://github.com/faxintan/creative-studio.git
cd creative-studio
openspec store register ./apps/chat
openspec store register ./apps/note
openspec doctor --store creative-studio-chat
openspec doctor --store creative-studio-note
```

已有 checkout 直接注册所需应用即可。注册信息保存在本机，不提交到仓库；不需要为所有机器设置全局 `defaultStore`。从旧的根 store 布局升级，参见[迁移说明](docs/workflow.md#从旧根-store-迁移)。

实现仓库选择对应应用，且只保留指针配置。例如 chat 的实现仓库：

```yaml
# 实现仓库中的 openspec/config.yaml
store: creative-studio-chat
```

Note 使用 `store: creative-studio-note`。实现仓库不维护本地 `openspec/specs/` 或 `openspec/changes/`；多个实现仓库可指向同一应用 store。

## 日常管理

从本仓库根目录操作时显式指定应用：

```bash
openspec list --store creative-studio-chat
openspec new change add-streaming --store creative-studio-chat
openspec status --change add-streaming --store creative-studio-chat
openspec validate add-streaming --strict --store creative-studio-chat
```

`new change` 仅创建骨架。随后使用 Codex 的 `$openspec-propose` 完成规划；已有骨架时明确要求继续该 change。其余核心技能为 `$openspec-explore`、`$openspec-apply-change`、`$openspec-update-change`、`$openspec-sync-specs`、`$openspec-archive-change`。在桌面端通过 Skills 选择对应技能，并明确应用 store。

管理流程为：**选择应用 → 创建并评审 change → 各实现仓库实施 → 联调验收 → 合并规范并归档 → 提交中央 Git 变更**。详细操作见[管理流程](docs/workflow.md)，Agent 操作前先读取 [AGENTS.md](AGENTS.md)。

OpenSpec 不自动分派跨仓库任务、不自动聚合所有应用，也不执行 Git 同步或发布。应用隔离是规划根目录隔离，仓库访问权限仍由 Git 托管平台控制。
