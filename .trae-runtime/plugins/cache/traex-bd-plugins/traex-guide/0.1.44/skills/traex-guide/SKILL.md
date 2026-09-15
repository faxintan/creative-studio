---
name: traex-guide
description: Use when the user asks how to use TraeX/traecli, how to contribute plugins to the TraeX built-in plugin marketplace, how to write or use TraeX plugins, what TraeX hooks exist, how to create TraeX skills, where TraeX stores logs/config/plugins/skills/MCP settings, common CLI/TUI commands, or what evidence to inspect when TraeX behavior is surprising.
---

# TraeX 指南

这个 skill 是轻量级 TraeX 用户指南。目标是帮助 TraeX 回答“TraeX 怎么用？”和
“下一步该看哪里？”这类问题，不加载大型事故处理手册。

回答要务实：

- 先给最常用的命令或位置。
- 再说明应该检查哪个本地文件、日志或 TUI 页面。
- 如果问题依赖用户本机状态，先要求或检查本地证据，再下诊断结论。
- 不要把某个历史 bug 当成以后所有相似问题的默认解释。

## 路由

只加载当前问题需要的参考文档：

- `references/usage.md`：文档总入口。按上手路径、使用场景和参考资料列出
  quickstart、核心概念、定制扩展、参考资料和故障排查入口。
- `references/quickstart.md`：快速入门。回答 `traecli` / `traex` 怎么选、怎么启动、
  怎么发第一条 prompt、怎么附图、怎么查看帮助和反馈。
- `references/interactive-mode.md`：交互模式。回答 TUI 输入、粘贴图片、特殊符号、
  排队消息、中断、backtrack、transcript、raw scrollback、statusline 和 title。
- `references/non-interactive-mode.md`：非交互模式。回答 `exec`、`review`、stdin/stdout、
  JSONL、output file、CI/脚本和非 Git 仓库运行。
- `references/permissions.md`：权限参考。回答 permission 模式、审批、Full Access、
  Auto-Review、推荐授权配置和权限报错。
- `references/context-management.md`：上下文管理。回答 `/context`、context window、
  compact、Recap、reasoning / thinking 展示。
- `references/session-management.md`：会话管理。回答 resume、fork、rename、backtrack、
  rewind、transcript 和 raw scrollback。
- `references/agents-md.md`：项目指令。回答 `AGENTS.md`、`AGENTS.override.md`、
  加载顺序、关闭条件和 `/status` 查看入口。
- `references/mcp.md`：MCP 集成。回答 MCP 配置、CLI 命令、TUI 入口和 MCP 登录问题。
- `references/skills.md`：Skills。回答 skill 位置、启用配置、sub-agent skill
  可见性、`/skills` 和 `SKILL.md` 加载失败。
- `references/hooks.md`：Hooks。回答 hook 体系关系、兼容层、配置位置、文件形状、事件列表、matcher、handler 字段、stdin/stdout 协议、排查和 `/hooks`。
- `references/subagents.md`：Subagents。回答 `/agents`、`/agent-new`、`/subagents`、
  自定义 agent 配置，以及只向指定 sub-agent 启用 skill 的方法。
- `references/plugins.md`：Plugins。回答插件安装、验证、启用、市场、缓存位置和插件
  贡献能力。
- `references/feedback.md`：反馈。回答 `/feedback`、反馈成功/失败提示和 bug 上报信息。
- `references/doctor.md`：环境健康检查。回答 `/doctor`、`traecli doctor` 和首轮诊断。
- `references/cli-reference.md`：命令参考。回答 CLI 根命令参数、子命令和常用选项。
- `references/settings.md`：配置参考。回答 `traecli.toml`、profiles、model provider、
  TUI、history 和其它常用配置项。
- `references/model-providers.md`：Model provider 配置。回答自定义 provider、
  wire API、OpenAI-compatible、Chat Completions、Anthropic Messages、Gemini、
  本地 OSS 模型和 provider 排查。
- `references/commands.md`：内置命令。回答 TUI slash 命令列表、当前生效能力查看和命令
  可见性。
- `references/keybindings.md`：键盘快捷键。回答全局快捷键、输入编辑键、审批弹窗键、
  transcript 浮层键和 Vim 模式。
- `references/paths.md`：日志、`traecli.toml`、配置档、插件、skills、MCP 配置、
  hooks、`AGENTS.md`、会话和工作区资源通常存在哪里。
- `references/troubleshooting.md`：小型证据清单和常见提示/报错含义。用于指导
  排查，不要直接跳到某个根因。
- `references/faq.md`：高频问题快速解答。用户询问安装/更新、登录、ChatGPT
  登录提示、模型列表、会话丢失、goals、后台 agents、复制文本、ACP、审批、
  自定义模型或 bug 上报时使用。

## 回答规则

- 优先使用 TraeX 专属路径和命令，不要套用通用 Claude Code、Codex 或 Coco
  假设。
- 区分用户主目录、CLI 主目录、项目/工作区文件和插件缓存。
- 路径或配置可能随环境变化时，明确提到 `TRAE_HOME` 和 `TRAECLI_HOME`。
- 回答插件问题时，说明插件会贡献 skills、MCP servers、hooks、apps、models
  等能力；用户通常直接使用插件贡献的能力，而不是操作“插件对象”本身。
- 回答 TraeX 内置 BD 插件市场贡献问题时，使用 `references/paths.md` 中的
  `.agents/plugins/marketplace.json` 和
  `.agents/plugins/<plugin-name>/...` 布局。如果其他插件创建指南给的是通用
  `plugins/<plugin-name>` 或 `./plugins/<plugin-name>` 示例，要转换成 TraeX BD
  插件市场布局再回答。
- hook 示例使用 `references/hooks.md` 中嵌套的 `hooks` 数组结构，不要用简化的
  顶层 `command` 字段；不要推荐当前运行时会跳过的 `prompt` / `agent` handler。
- 失败问题先收集版本、命令、cwd、主目录、配置、日志和反馈包，再给具体根因。
- AI 代码贡献上报问题先读 references/faq.md 的对应段；如果已安装 ai-contribution 的 check-hook-reporting skill，使用它检查真实会话的采集、入队、投递和缓存。只摘相关配置和日志，不输出认证或代码正文。

## 常见首轮回答

用户问“TraeX 怎么用？”时：

1. 先识别用户问的是 TUI、非交互 `traecli exec` / `traex exec`、配置、插件、
   skills、MCP、日志还是排障。
2. 加载 `references/usage.md`。
3. 按 `usage.md` 的索引加载对应专题文档。
4. 先给最短可执行路径，再补可选细节。

用户问某个东西安装或配置在哪里时：

1. 加载 `references/paths.md`；如果问的是 hooks 配置怎么写或为什么不触发，再加载 `references/hooks.md`。
2. 说明最可能的用户级和项目级位置。
3. 如果需要精确路径，询问或检查 `TRAE_HOME` / `TRAECLI_HOME`。

用户反馈报错时：

1. 加载 `references/troubleshooting.md`。
2. 如果现象匹配高频问题，也加载 `references/faq.md`。
3. 在归因前，先指向日志、反馈包、`/status`、相关配置和最近本地变更。
4. 给下一两个检查点，不要展开完整内部事故分析。

用户问常见使用问题时：

1. 加载 `references/faq.md`。
2. 先给最短命令或操作。
3. 只有问题依赖本地状态时，才补需要收集的证据。
