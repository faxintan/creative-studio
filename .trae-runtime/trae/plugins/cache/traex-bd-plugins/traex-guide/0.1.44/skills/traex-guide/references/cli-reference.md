# 命令参考（CLI Reference）

## 常见 CLI 子命令

- `traecli exec "<prompt>"`：不打开 TUI，运行一次性任务。
- `traecli exec -C <dir> "<prompt>"`：在指定工作根目录运行一次性任务。
- `traecli review`：非交互式评审当前改动。
- `traecli resume`：恢复之前的交互式会话。
- `traecli fork`：从之前的交互式会话复刻一个分支会话。
- `traecli login`、`traecli login status`、`traecli logout`：管理登录状态。
- `traecli update`、`traecli update check`、`traecli update --dry-run`：更新或检查可用更新。
- `traecli mcp list`、`traecli mcp get <name>`、`traecli mcp add ...`、`traecli mcp remove <name>`、`traecli mcp login <name>`、`traecli mcp logout <name>`：管理外部 MCP server。
- `traecli plugin list`、`traecli plugin install <source>`、`traecli plugin validate <plugin>`、`traecli plugin uninstall <plugin>`、`traecli plugin enable <plugin>`、`traecli plugin disable <plugin>`：管理插件。插件名有歧义时，使用 `<plugin>@<marketplace>`。
- `traecli plugin marketplace list`、`traecli plugin marketplace add <source>`、`traecli plugin marketplace remove <name>`、`traecli plugin marketplace list-plugins`：管理插件市场。
- `traecli features list`、`traecli features enable <feature>`、`traecli features disable <feature>`：查看或切换 feature flags。
- `traecli acp serve`：以 stdio ACP agent 方式运行，供支持 ACP 的本地 client 拉起。
- `traecli app-server --listen ws://...`：启动 app-server，供本机或远端 `traecli --remote` / `traex --remote` 连接。
- `traecli remote-control`：实验性启动带 remote-control 的 headless app-server。它不是
  Coco Web 同款网页运行时；不要把它解释成 Web 侧 resume session 或继续执行入口。
- `traecli sandbox <platform> -- <command>`：在当前平台对应的 TraeX 沙箱里运行命令。
- `traecli completion <shell>`：生成 shell 补全脚本。
- `traecli doctor`：收集本地诊断信息。
- `traecli migrate`：把旧 Coco 配置、资源和可迁移 session 迁移到 TraeX 存储；部分版本也保留 `migrate-coco` 兼容入口。
- `traecli apply`：在可用时，把 agent 最近生成的 diff 应用到本地工作区。

## 通用 CLI 选项

- `-m, --model <MODEL>`：指定模型。
- `-i, --image <FILE>`：给初始 prompt 附加图片；多个文件可用逗号分隔。
- `-p, --profile <NAME>`：使用 `~/.trae/<NAME>.traecli.toml` 里的配置档。
- `-s, --sandbox <MODE>`：沙箱策略，常见为 `read-only`、`workspace-write`、`danger-full-access`。
- `--permission-mode <MODE>`：权限模式预设；`exec` 下常见支持 `plan`、`bypass_permissions`、`custom`。
- `-C, --cd <DIR>`：把指定目录作为工作根目录。
- `--add-dir <DIR>`：增加额外可写目录，可多次指定。
- `--oss`：使用开源本地模型提供方。
- `--local-provider <NAME>`：本地 provider，常见为 `lmstudio` 或 `ollama`。
- `-c, --config <key=value>`：临时覆盖配置；支持点号路径，值按 TOML 解析，可多次指定。
- `--enable <FEATURE>` / `--disable <FEATURE>`：开关 feature flags。
- `-V, --version` / `-v`：打印版本。
- `-h, --help`：查看帮助。

## 交互模式专属选项

- `-a, --ask-for-approval <POLICY>`：审批策略，常见为 `untrusted`、`on-failure`、`on-request`、`never`。
- `--search`：启用实时 web search。
- `--no-alt-screen`：不切到备用屏，保留终端滚动历史。
- `--allowed-tool <TOOL>` / `--disallowed-tool <TOOL>`：本 session 允许或禁止工具，可多次指定。
- `-w, --worktree[=NAME]`：在新的 git worktree 中隔离运行。
- `--worktree-mode <git|reflink>`：配合 `--worktree` 指定创建策略。
- `--resume[=SESSION_ID]`：恢复本地 session；不带 ID 时恢复最近一次。
- `--remote <ADDR>`：连接远端 app server，例如 `ws://host:port`。
- `--remote-auth-token-env <ENV>`：指定远端 bearer token 所在环境变量名。

`--worktree-mode` 默认是 `git`：使用 Git 原生 worktree，通常只带入仓库管理的内容。
`reflink` 会在支持 CoW 的文件系统上额外复制非 Git 内容到新工作区，空间开销小但可能更慢，
且依赖 APFS、XFS、Btrfs 等文件系统能力。
