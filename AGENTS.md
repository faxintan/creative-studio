# 全仓库操作约定

## 仓库职责

- 本仓库集中存放应用规范、proposal、design、tasks、评审证据和归档；应用代码、应用测试、运行配置和构建产物保存在明确指定的实现仓库。
- 先读取根 README 的应用索引、目标应用 README 和该应用的 `openspec/config.yaml`。
- `apps/chat` 对应 `creative-studio-chat`；`apps/note` 对应 `creative-studio-note`。根目录本身不是 store。

## 选择规划根目录

- 在任何规划写入前确认应用。应用不明确时询问；不得默认选择 chat、note 或创建根级 `openspec/`。
- 在中央仓库操作支持 `--store` 的命令时始终携带目标 store：先运行 `openspec context --store <store-id> --json`，确认 `root.path` 是预期的应用目录。
- Store 未注册时，按应用 README 注册对应子目录。注册失败时诊断实际错误，不得通过初始化仓库根目录或设置全局 `defaultStore` 绕过。
- `init`、`update` 等集成维护命令及不支持 `--store` 的命令，以当前 CLI 帮助为准，显式选定应用目录。不得在中央仓库根目录运行 `openspec init`；共用技能位于 `.agents/skills/`，它们不是根 store 的证明。
- 每个应用是独立 OpenSpec 根目录，配置不会从根目录或兄弟应用自动继承。

## 规范与变更

- 每个应用先集中维护 `apps/<app>/openspec/specs/<app>/spec.md`。不要在需求未确认时填充示例产品要求，也不要提前拆分每个细小能力。
- 主规范描述当前有效行为，使用 `## Purpose`、`## Requirements`、`### Requirement:`、`#### Scenario:` 结构；要求使用 SHALL/MUST 等明确关键词，场景可验收。
- 新增或改变行为先建立 change；变化使用 ADDED/MODIFIED/REMOVED/RENAMED delta。保留应用的完整 spec ID，首次新增主规范使用 ADDED。
- proposal 写明应用、实际实现仓库、范围、非目标、中央规划版本和跨仓库依赖。实现仓库未指定时明确待确认，不猜测真实仓库名或 URL。
- design 记录接口契约、兼容性、实施顺序、异常与回退方案；tasks 中每个实施任务注明目标仓库，并包含测试和联调验收。
- 规划产物状态完成只表示文件存在，不代表实现完成。只有相关工作完成且有验证证据时才勾选任务。
- 活跃 change 的需求调整同步修订相关产物；归档后的行为变化创建新 change。并行变更修改相同要求时，归档前对比最新主规范并解决冲突。

## 实施与跨应用协作

- 应用实现仓库仅以 `store: creative-studio-<app>` 接入，不再创建本地 specs/changes。若已存在本地规划，先检查并迁移，不能直接删除以启用指针。
- 指针仅选择规划位置，不自动分派任务，也不代表可以编辑所有实现仓库。实施前明确当前目标仓库，仅读取并执行属于它的任务。
- 让 Agent 同时访问应用 store 和选定实现仓库，并在实现会话中提供本文件、应用 README 与配置中的相关约束；中央 AGENTS.md 不会自动约束仓库之外的代码目录。
- 中央变更与实现 PR 相互记录 change ID、规划提交号、实现 PR 和验证结果。使用 CLI 返回的 `planningHome`、`changeRoot`、`actionContext` 确认路径与范围。
- 跨应用需求在各应用 store 创建关联 change，相互记录依赖和验收顺序；应用共用 Git 分支，不具有独立分支切换或权限边界。

## 验证与归档

- 修改规划后运行目标 store 的严格校验；修改共用管理规则时检查所有受影响应用。不要把空 store 的零项校验当成业务验收。
- 归档前核对规划完整性、任务勾选、实现 PR 状态、测试和联调证据；遵守本应用 config 的 archive guidance。
- 正常业务归档先合并 delta 至本应用主规范，再移入本应用的 archive。不要为绕过合并问题使用 `--skip-specs` 或修改既有归档。
- 归档由 Agent 执行时读取当前 instructions 和目标路径，使用官方归档/同步工作流；CLI 不会替代实际实现验收。
- 规则与 guidance 是 Agent 指导，不是强制执行器。不得宣称 OpenSpec 自动验证了代码、权限、Git 合并或发布。

## Git 与维护

- 所有应用使用当前中央 Git 仓库；应用目录内不得创建 `.git`。保留已有用户修改，不擅自提交、推送或清理未知文件。
- `.gitkeep` 用于让空 specs/archive 目录随克隆保留。不要提交机器注册表、workset 绝对路径或临时验证 change。
- 新增应用遵循 `docs/workflow.md`，同步更新根应用索引，并给它独立 store 身份、配置和 README。
- `.agents/skills/openspec-*` 及 `.openspec-target` 由 OpenSpec 生成；自定义规则写在本文件、应用 README 和应用配置中。
