# TraeX 排障指南

这份参考文档用来帮助用户收集下一条有价值的线索。除非本地证据支持，不要从现象
直接跳到某个历史根因。

## 首轮检查

要求或检查：

1. TraeX 版本和使用的命令，可来自启动输出、`traecli --version` /
   `traex --version` 或反馈数据。
2. 工作目录。
3. `TRAE_HOME` 和 `TRAECLI_HOME`。
4. 最近的本地日志路径和片段。
5. 可用时的 `/status` 输出。
6. 已脱敏的相关 `traecli.toml` 或项目 `.trae/` 配置。
7. 难以复现时的 `/feedback` 包。
8. 问题出现在 TUI、`traecli exec` / `traex exec`、app-server、MCP、插件加载，
   还是只出现在某个模型/提供方路径。

## 有用的本地入口

- `/status`：当前模型、鉴权/配置上下文、cwd 和会话状态。
- `/debug-config`：可用时查看配置层和需求来源。
- `/feedback`：bug 上报用的诊断包。
- `/plugins`：插件和插件市场状态。
- `/skills`：对模型可见的 skills。
- `/mcp`：MCP server/tool 状态。
- `/doctor`：可用时执行 CLI 诊断和环境检查。
- `/rollout`：可用时打印当前 rollout 文件路径。
- 本地日志文件：当前 TUI 构建常见位置是 `$TRAE_HOME/log/traecli-tui.log`。

## 当前生效能力怎么看

用户问“现在到底加载了什么”时，先让用户在 TUI 里看运行时状态：

- 当前生效权限、模型、cwd、collaboration mode 和 `AGENTS.md`：`/status`。
- 当前对模型可见的 skills：`/skills`。
- 当前可创建的 agent roles：`/agents`。
- 当前已经启动的 agent threads：`/subagents`。
- 当前插件和插件市场状态：`/plugins`。
- 当前 MCP servers/tools：`/mcp`。
- 当前 hooks：`/hooks`。

如果这些入口和预期不一致，再检查 `TRAE_HOME`、`TRAECLI_HOME`、项目 `.trae/` 资源、
插件缓存、目录信任状态和 `/debug-config`。

## 常见运行提示

- `Working...`、`Thinking...`、`Reasoning through it...` 或类似状态文本表示 agent
  正在运行。按 `Esc` 可中断当前轮次。
- `Waiting for response...` 持续几秒后出现，通常表示 CLI 仍在等待模型输出。
- `Queued for capacity` 表示后端已接收请求，但还在等待模型容量。
- `Waiting for background terminal` 表示后台 shell 命令仍在运行或等待收集。
- `Tip:` 行是内置使用提示，不是错误。
- `Recap:` 是多轮会话重新聚焦后显示的自动会话摘要，只是信息提示。
- `Copied last message to clipboard` 或 `Copied message #N to clipboard` 表示
  `/copy` 成功。
- `Thread renamed to <name>, to resume this thread run traecli resume <name>`
  表示 `/rename` 成功。
- `Undo completed successfully.` / `Undo failed.` 是 `/rewind` 结果。
- `Stopping all background terminals.` 是 `/stop` 结果。
- `Side conversations are ephemeral and cannot be renamed.` 表示在 `/side` 对话中使用
  了 `/rename`；需要可重命名分支时用 `/fork`。

## 启动和信任提示

- `Do you trust the contents of this directory?` 控制项目级配置、hooks 和执行策略
  是否加载。在 Git 子目录中信任会作用到仓库根。
- 如果项目配置因为目录未信任而被禁用，先信任目录，再诊断项目 `.trae/` 配置或 hooks。
- `Skipped loading N skill(s) due to invalid SKILL.md files.` 表示至少一个 skill
  入口解析失败。检查列出的路径并修复 `SKILL.md` 元数据或格式。
- 旧版或外部 agent 配置迁移提示可以接受、跳过一次或永久忽略。迁移后配置缺失时，同时
  检查旧主目录和新主目录。

## 配置或设置不生效

检查：

1. 用户是否用预期的 `TRAE_HOME` 和 `TRAECLI_HOME` 启动 TraeX。
2. 设置是在用户配置、项目 `.trae/`、配置档，还是命令行 `-c` 覆盖中。
3. 项目信任状态是否允许项目本地资源加载。
4. 可用时检查 `/status` 和 `/debug-config` 输出。
5. 旧版 `config.toml` 是否已重命名，或被 `traecli.toml` 覆盖。

## 权限或沙箱行为

用户询问跳过审批、禁用沙箱或使用 `dangerously-skip-permissions` 时，先区分“精确参数
兼容性”和“TraeX 等价能力”：

1. 在用户安装的二进制上检查 `traecli --help` 或 `traecli exec --help` 的精确参数名。
   如果 `traecli` 仍是旧 Coco，改查 `traex --help`。
2. 把 `--dangerously-skip-permissions` 当成 Claude 风格参数名，而不是 TraeX 参数。
3. 当前 TraeX 中，用户明确要求 full access 时，指向
   `--dangerously-bypass-approvals-and-sandbox` 或
   `--permission-mode bypass_permissions`。
4. TUI 中使用 `/permissions`，可用时选择 `Full Access`。
5. 行为异常时，用 `/status`、`/debug-config` 或日志确认最终生效模式。

关键区别是：“不支持这个精确 upstream 参数名”不等于“TraeX 没有权限绕过模式”。当前
TraeX 会把危险绕过路径映射到审批策略 `never` 加 full-access sandbox 行为，TUI 也有
`full-access` preset。

## 插件或 Skill 缺失

检查：

1. 当前生效主目录：`TRAE_HOME` 和 `TRAECLI_HOME`。
2. 插件市场是否已配置：`traecli plugin marketplace list`。
3. 插件是否已安装/启用：`traecli plugin list`。
4. 已安装插件是否验证通过：`traecli plugin validate <plugin>` 或
   `traecli plugin validate --path <dir>`。
5. 插件缓存中是否存在预期能力，例如 `skills/<name>/SKILL.md`、`.mcp.json` 或
   `hooks/hooks.json`。
6. 当前构建是否有对应 TUI 页面。
7. 插件来源是插件市场、直接本地安装，还是远端/默认来源。

## MCP 缺失或失败

检查：

1. MCP 配置来源：项目配置、用户配置或插件 `.mcp.json`。
2. server 命令、cwd、环境和鉴权要求。
3. 日志里的启动超时或 command-not-found 错误。
4. 可用时检查 `/mcp` 状态。
5. 问题是 server 启动、tool listing，还是某次具体 tool call。

对 streamable HTTP MCP server，检查配置 URL 和 bearer-token 环境变量。对 stdio MCP
server，检查命令、参数和环境。

## Hook 不运行

先加载 `references/hooks.md`，再检查：

1. `/hooks` 是否能看到这条 hook；看 source、event、matcher、enabled、trust/review 状态。
2. hooks 是用户级（`$TRAECLI_HOME/hooks.json`）、项目级（`<workspace>/.trae/hooks.json`）、
   resource dir，还是插件提供（`hooks/hooks.json`，或插件清单中的 `hooks` 路径）。
3. 项目目录是否已 trust；如果 hook 来自插件，插件是否安装并启用。
4. hook 事件名是否在当前运行时支持列表里，尤其不要漏 `PermissionRequest`、
   `PostToolUseFailure`、`PreCompact`、`PostCompact`、`SubagentStart/Stop`、`SessionEnd`。
5. `matcher` 是否匹配被触发的工具/事件；`SessionEnd`、`UserPromptSubmit`、`Stop` 会忽略 matcher。
6. handler 是否是 `type: command`；`prompt` / `agent` 当前会被跳过。
7. 命令能否在当前 cwd、shell、PATH、环境和 timeout 下运行。
8. stdout 是否是该事件支持的合法 JSON；例如 `PreToolUse` 不支持 `decision:"approve"`，
   `PermissionRequest` 不支持 `updatedInput` / `updatedPermissions`。
9. 日志是否提到 hook 解析错误、invalid matcher、unsupported field、命令失败或超时。

## 模型或后端错误

检查：

1. `/status` 或日志中显示的当前模型和提供方。
2. endpoint 覆盖和鉴权状态。
3. 如果有 request logid 或 backend error id，记录下来。
4. 失败发生在首 token 前、流式输出中、tool call 后，还是 retry/resume 时。
5. 切换模型/提供方后现象是否变化。

通用顶层错误可能隐藏很多原因。把可见错误文本当成起点，不要当成最终诊断。

## 后台进程或 Shell 问题

检查：

1. `/ps` 中运行中的进程和 inbox。
2. 需要时用 `/stop` 停止后台终端。
3. 进程启动或命令失败附近的日志片段。
4. 命令是否依赖 cwd、环境或 sandbox/permission mode。

## 常见报错含义

沙箱和权限：

- 输出包含 `permission denied` 或 `operation not permitted`，通常表示 sandbox 或权限
  配置档拦截了命令。用 `/permissions`、更安全的命令，或在预期写文件时使用
  `workspace-write`。
- `Network access to "<host>" was blocked: ...` 表示网络访问被沙箱策略拦截。
  检查 `[sandbox_workspace_write] network_access`、当前权限配置档和域名审批行为。
- `This action was rejected due to unacceptable risk.` 表示自动审批评审拒绝了该动作。
  只有用户接受风险时才用 `/approve` 单次重试，否则换更安全的操作。
- `The automatic permission approval review did not finish before its deadline.`
  表示评审超时。可以重试，或在合适时显式批准。

工具和命令执行：

- 两行工具失败并带 `Error: <details>` 时，先根据详细错误诊断：路径、参数、权限或环境。
- 非零退出和超时通常表示命令本身失败。检查命令、cwd、环境和后台终端超时配置。

鉴权、后端和 MCP：

- 未登录或凭据过期：运行 `/login` 或 `traecli login`。
- `The <server> MCP server is not logged in. Run ... mcp login <server>.` 表示需要登录
  对应 MCP server。
- 启动时的 `Backend connection failed` 是致命后端连接问题。检查端口、主目录权限、
  鉴权状态后重启。

网络、模型和上下文：

- `stream disconnected - retrying...` 或 `Reconnecting...` 表示 stream 断开，CLI 正在
  重试。持续失败时检查网络和日志。
- compaction 时报 context window exceeded 通常表示历史过大。使用 `/compact` 或 `/new`。

配置和 worktree：

- `config profile '<name>' not found` 表示选择了不存在的配置档。
- `config defines [permissions] profiles but does not set default_permissions` 表示需要配置
  默认权限配置档。
- `... overrides cannot both be set` 表示新旧权限配置字段冲突；删除其中一边。
- `Unknown isolation value "..."; only "worktree" is supported.` 表示自定义 agent
  isolation 只能使用 `worktree`。
- 不在 Git 仓库时，交互模式可能拒绝启动；非交互任务可用
  `traecli exec --skip-git-repo-check`。
- worktree 创建失败通常需要有效 Git 仓库，并且 HEAD 不能是 detached HEAD。

## 上报 Bug 时保留

- TraeX 版本/commit，以及显示的 dirty state。
- 命令、cwd、homes 和相关环境。
- 最小复现步骤。
- 已脱敏的相关配置。
- 日志片段和 logid/error id。
- 可用时的反馈包。
- 行为是本地实时复现，还是反馈回放。
