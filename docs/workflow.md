# 应用规范与变更管理流程

## 管理边界

中央仓库按 `apps/<app>` 集中管理规划，每个应用目录都是独立 store。全仓库约定见 [AGENTS.md](../AGENTS.md)，应用列表见 [README.md](../README.md)。

| 内容 | 位置与职责 |
| --- | --- |
| 主规范 | `apps/<app>/openspec/specs/<app>/spec.md`，当前有效的完整应用行为 |
| 活跃 change | `apps/<app>/openspec/changes/<change-id>/`，准备实施的行为变化 |
| proposal | 变更动机、范围、非目标、实现仓库与依赖 |
| delta spec | `changes/<change-id>/specs/<app>/spec.md`，相对主规范的增删改 |
| design | 接口契约、实现职责、兼容性、实施顺序和回退 |
| tasks | 分仓库任务、验证与联调验收 |
| archive | 本应用 `changes/archive/YYYY-MM-DD-<change-id>/`，保存已完成变更的历史 |
| 实现代码与测试 | 选定的外部应用实现仓库 |

主规范先集中在一个文件内；首次归档前允许为空。不将示例需求当成已批准需求，不复制整份主规范到实现仓库，也不为小功能提前拆出很多 spec。

## 本机注册与实现仓库接入

1. 安装已验证版本 `npm install -g @fission-ai/openspec@1.14.2`。
2. 克隆中央仓库，从其根目录注册所需应用：

   ```bash
   openspec store register ./apps/chat
   openspec store register ./apps/note
   openspec store list --json
   ```

3. 在真正的应用实现仓库内创建指针文件。例如 chat：

   ```yaml
   # 实现仓库的 openspec/config.yaml
   store: creative-studio-chat
   ```

4. 如果实现仓库已有 `openspec/specs/`、`openspec/changes/`，先检查并将相关规划迁移到正确的中央应用 store，解决重名与基线差异，通过评审后移除本地规划目录。真实本地规划目录会优先于 `store:` 指针，不能只添加指针后假定生效。
5. 从实现仓库根目录安装 Codex 集成：`openspec init --tools codex`。对有效的 config-only 指针仓库，该命令安装集成并保留指针，不创建本地 specs/changes。不要加 `--language`；规划语言在中央应用配置中维护。
6. 验证指针解析：

   ```bash
   openspec context --json
   openspec doctor --json
   ```

   `root.path` 必须为中央 checkout 的 `apps/chat`，`root.store_id` 为 `creative-studio-chat`。Note 对应 `apps/note` 和 `creative-studio-note`。

每台机器分别注册，注册信息和 workset 路径不提交到 Git。一个 store ID 在本机只对应一个 checkout；切换 checkout 前显式 unregister 旧注册，再 register 新目录。多个应用共用同一个 Git checkout，也共用其当前分支。

## 创建和评审应用 change

以下以 chat 的 `add-streaming` 为命令示例，不表示已经批准或创建该产品需求。

从中央根目录显式选择应用：

```bash
openspec context --store creative-studio-chat --json
openspec new change add-streaming --store creative-studio-chat
openspec status --change add-streaming --store creative-studio-chat --json
```

`new change` 只创建骨架。使用 `$openspec-propose` 完成规划时，明确 store 与 change；如果已创建骨架，要求继续它，不再新建同名变更。根据 `status` 与 `instructions` 填写 schema 要求的产物。

业务 delta 位于 `apps/chat/openspec/changes/add-streaming/specs/chat/spec.md`，采用标准段落：

- `ADDED Requirements`：新增行为；新主规范只能从新增要求创建。
- `MODIFIED Requirements`：已有行为的完整新版本，保留仍有效的场景。
- `REMOVED Requirements`：删除已有要求，写明原因及影响。
- `RENAMED Requirements`：重命名已有要求，保留可追踪的对应关系。

新主规范的 delta 应提供 `## Purpose`，要求以 `### Requirement:`、场景以 `#### Scenario:` 编写。应用内部能力先以多个 Requirement 组织在同一文件。

Proposal 明确实际实现仓库；tasks 每项注明目标仓库。实现仓库未确定时保持待确认，不能将假定的仓库名当成事实。规划评审要覆盖行为、异常、契约、兼容性和验收：

```bash
openspec validate add-streaming --strict --store creative-studio-chat
```

通过中央 Git 分支和 PR 评审规划。实施交接前保存规划提交号；后续修订也通过 Git 同步，OpenSpec 只读取本机 checkout，不自动拉取或锁定版本。

## 在应用仓库实施

从正确的实现仓库发起 apply 会话，同时让 Agent 能访问中央 checkout。向它提供中央 AGENTS.md、应用 README 和配置中的相关约束；跨目录文件可见性不等于编辑其它仓库的授权。

示例指令：

```text
使用 openspec-apply-change 实施 creative-studio-chat 的 add-streaming。
先确认规划根目录和中央规划版本，读取对应 change 和应用约束。
本轮仅执行当前已指定实现仓库的任务；代码与测试写在该实现仓库。
完成验证后回填中央 tasks，并记录实现 PR、验证命令和结果。
```

多实现仓库共享一个中央 change，不在各仓库重复创建本地实施 change。OpenSpec 不自动按仓库路由任务；每次实施都必须明确仓库范围。

实现 PR 记录应用、store ID、中央 change ID 和规划提交号；中央 change 记录实现 PR、验证结果及未完成事项。尚未归档的目标行为要读取活跃 change，不能只读取当前主规范。

应用主规范存在后可读取：

```bash
openspec show chat --type spec --store creative-studio-chat
openspec show add-streaming --store creative-studio-chat
```

## 验收、同步和归档

1. 检查规划产物是否完整、实际实现是否完成、测试与联调是否通过，并核对关联 PR。`status` 中规划完成不代表实施完成，严格校验也不验证产品代码。
2. 将完成任务勾选，并在 change 中记录实现 PR 和验证证据。未完成任务不能直接标成完成。
3. 使用 `$openspec-archive-change`，显式选择应用和 change。根据工作流检查 delta 与当前主规范，合并并验证，再归档。
4. 确认完成后也可使用 CLI 的默认合并与归档路径：

   ```bash
   openspec archive add-streaming --store creative-studio-chat
   openspec validate --all --strict --store creative-studio-chat
   openspec validate --archived --store creative-studio-chat
   ```

5. 检查 `apps/chat/openspec/specs/chat/spec.md` 已反映最终行为，change 位于本应用的 archive，再提交并评审中央 Git 修改。归档命令本身不会提交、推送、合并实现 PR 或发布应用。

正常业务归档不跳过 spec 同步。工具或文档类变更若永久不涉及业务规范，可以按 CLI 的 schema 约定在 change 元数据中声明 `skip_specs: true`；不能用它绕过未完成的业务设计。

## 后续变化与跨应用协作

- 活跃 change 的细节修订：使用 `$openspec-update-change` 保持现有产物一致，并再次评审和验证。CLI 的 `openspec update` 刷新集成文件，不修改业务 change。
- 归档后新增或改变行为：创建新 change，不重写历史归档。
- 代码不符合已有规范：在实现仓库修复并验证；若不改变行为契约，无需改主规范。
- 多个活跃 change 改同一要求：归档前比较最新主规范并协调合并顺序。
- 同一需求影响 chat 与 note：在两个应用分别建 change，在 proposal 中互相引用 store/change、提交号、依赖顺序和联合验收条件。中央 PR 可以覆盖两个应用，但各 store 的归档需分别执行，不存在自动跨 store 事务。

## 新增应用

假设已确认新应用 ID 为 `calendar`，从中央仓库根目录执行：

```bash
openspec store setup creative-studio-calendar --path ./apps/calendar \
  --remote https://github.com/faxintan/creative-studio.git --no-init-git
```

`--no-init-git` 确保应用目录没有嵌套 Git 仓库，也不自动提交中央仓库。此命令创建并注册该应用 store。

随后完成：

1. 添加 `apps/calendar/README.md`，登记应用说明、负责人、真实实现仓库、store ID、主规范路径和接入方式；未知信息明确待确认。
2. 参考现有应用编写独立 `openspec/config.yaml`：集中式规范路径为 `openspec/specs/calendar/spec.md`，包含分仓库任务规则和实施、归档指导。不要假定自动继承其它应用配置。
3. 更新根 README 的应用索引，不预先创建带示例产品要求的主规范。
4. 验证 context、doctor 和严格校验，并将空目录标记纳入 Git。
5. 在实现仓库仅配置 `store: creative-studio-calendar`，检查指针解析后再实施首个业务 change。

`store.yaml` 记录的是中央仓库 remote，无法携带“自动注册哪个子目录”的完整接入语义。接入说明必须明确：克隆中央仓库后注册 `apps/calendar`。

## 从旧根 store 迁移

旧布局的根 store ID 为 `creative-studio`。当前仓库迁移前只有初始化配置和空目录标记，没有业务规范或 change；因此已将根规划结构替换为应用 store。

其它机器更新此仓库后，在中央根目录执行：

```bash
openspec store unregister creative-studio
openspec store register ./apps/chat
openspec store register ./apps/note
```

仅在本机存在旧注册时执行 unregister；它只删除本机注册，不删除仓库文件。若全局 `defaultStore` 或实现仓库指针仍为 `creative-studio`，检查后清除旧默认或改成明确的应用 store；不要静默将所有旧指针都映射到 chat。

不要运行 `openspec store remove creative-studio`：该命令会尝试删除整个已注册目录。若其它分支或 checkout 已有真实业务规划，应先分类迁移、验证并评审，再移除旧结构。

子 store 不是独立 Git 根，`store doctor` 可能提示没有独立 Git 仓库；这是此布局的预期诊断，应同时在中央根检查 `git status`。根目录没有 OpenSpec root 是预期状态，所有规划命令必须选择应用。CLI 不自动聚合应用列表，不提供应用间访问控制。
