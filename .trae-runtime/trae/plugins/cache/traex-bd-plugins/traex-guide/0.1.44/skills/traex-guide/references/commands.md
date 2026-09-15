# 内置命令（Commands）

## 常见 TUI 页面和命令

- 会话流程：`/new`、`/clear`、`/resume`、`/fork`、`/rename`、`/compact`、`/rewind`、`/undo`、`/undo-rewind`、`/recap`、`/quit`、`/exit`。
- 调试和反馈：`/status`、`/context`、`/cost`、`/feedback`、`/doctor`、`/debug-config`、`/rollout`、`/trace`、`/share`。
- worktree 和评审：`/diff`、`/review`、`/copy`、`/raw`、`/rewind`、`/undo`。
- 模型和模式：`/model`、`/permissions`、`/plan`、`/goal`、`/collab`、`/experimental`。
- 能力扩展：`/skills`、`/plugins`、`/mcp`、`/apps`、`/agents`、`/agent-new`、`/subagents`、`/hooks`。
- 界面和终端：`/theme`、`/color`、`/vim`、`/statusline`、`/title`、`/keymap`、`/help`、`/terminal-setup`、`/ide`。
- 沙箱和目录：`/setup-default-sandbox`、`/sandbox-add-read-dir <abs-path>`、`/add-dir <path>`。
- 进程管理：`/ps`、`/stop`，`/stop` 也可用别名 `/clean`。
- 上下文和记忆：`/compact`、`/recap`、`/memories`、`/memory`、`/dream`。
- 旁路对话：`/btw` 和 `/side` 可以在不替换主对话的情况下问小问题；`/side` 对话是临时的。
- 循环任务：`/loop` 在新版中已有基础版本；退出 session 会结束当前 loop。需要强定时
  或复杂 cron 语义时，先按当前版本能力确认，不要承诺 Claude Code 完整同款行为。
- 其它常用：`/init` 创建 `AGENTS.md`，`/mention` 提及文件，`/logout` 登出。
- 帮助：`/help` 和 `?` 显示当前构建支持的命令和快捷键。

`/ide` 需要 IDE 侧扩展连接可用。普通终端里没有 VS Code / Cursor + TRAE IDE extension
上下文时，可能提示 `IDE context could not be enabled` 或没有可注入的 IDE 信息。

`/trace` 打开当前 thread 的 Argos trace 观测页；`/share` 会分享当前 Argos trace 并打开。
这些是只读观测入口，不是 Web 侧接续执行入口。

## 查看当前生效能力

- `/skills`：查看当前对模型可见的 skills。
- `/agents`：查看可创建的 agent roles，包括内置和自定义 agents。
- `/subagents`：查看当前已启动的 agent threads。
- `/plugins`：查看已安装/启用的插件；插件可能贡献 skills、MCP、hooks、apps 等能力。
- `/mcp`：查看当前 MCP servers/tools 状态。
- `/status`：查看当前模型、目录、权限、collaboration mode 和已加载的 `AGENTS.md` 概要。

命令可见性可能受平台或构建影响：`/sandbox-add-read-dir` 仅 Windows，`/rollout` 和 `/test-approval` 仅 debug 构建，`/copy` 在 Android 上隐藏。带参数的 slash 命令可以直接在命令后输入参数，例如 `/review 看看并发安全` 或 `/mcp verbose`。
