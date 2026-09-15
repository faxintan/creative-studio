# TraeX 用户手册

按上手路径、使用场景和参考资料组织 TraeX 文档。用户可以先按“第一次使用”的路径读，也可以按当前问题跳到对应专题。

## 新手从这里开始

- `quickstart.md` — 快速上手：`traecli` / `traex` 怎么选、第一次启动、第一次提问、附图、查看帮助和反馈。

## 核心概念

- `permissions.md` — 权限参考：permission 模式、审批规则、Full Access、Auto-Review 和安全边界。
- `context-management.md` — 上下文管理：context window、`/context`、自动 compact、手动 compact 和 context 超限。
- `session-management.md` — 会话管理：session 的恢复、fork、rename、backtrack、rewind 和 raw transcript。

## 使用 TraeX

- `interactive-mode.md` — 交互模式：TUI 输入、粘贴图片、特殊符号、排队消息、transcript、statusline 和常用交互。
- `non-interactive-mode.md` — 非交互模式：`traecli exec`、JSONL 输出、stdin/stdout、脚本和 CI 用法。

## 定制与扩展

- `agents-md.md` — 项目指令：`AGENTS.md` / `AGENTS.override.md` 加载规则和查看入口。
- `mcp.md` — MCP 集成：MCP 配置、CLI 管理命令和 TUI 查看入口。
- `skills.md` — Skills：skill 位置、启用配置和 `/skills` 查看入口。
- `hooks.md` — Hooks：hook 配置形状、事件和 `/hooks` 查看入口。
- `subagents.md` — Subagents：agents/subagents 查看入口和自定义 agent 配置。
- `plugins.md` — Plugins：插件安装、验证、启用、市场和缓存位置。

## 反馈

- `feedback.md` — 反馈：`/feedback` 成功/失败提示和反馈包位置。

## 参考资料

- `cli-reference.md` — 命令参考：根命令参数、子命令及常用选项。
- `settings.md` — 配置参考：`traecli.toml`、profiles、model provider、TUI、history 和常用配置项。
- `model-providers.md` — Model provider 配置：自定义 provider、wire API、本地 OSS 模型和排查。
- `commands.md` — 内置命令：TUI slash 命令列表和用途。
- `keybindings.md` — 键盘快捷键：全局快捷键、输入区快捷键、审批弹窗键和 Vim 模式。
- `paths.md` — 路径速查：日志、配置、插件、skills、MCP、hooks、sessions 和工作区资源路径。

## 故障排查与安全

- `faq.md` — 高频问题快速解答。
- `doctor.md` — 环境健康检查：`/doctor`、`traecli doctor` 和排障入口。
- `troubleshooting.md` — 排障证据清单和常见报错。
