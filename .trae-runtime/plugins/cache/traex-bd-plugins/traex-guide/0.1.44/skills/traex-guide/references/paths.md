# TraeX 路径速查

用户询问 TraeX 的日志、配置、插件、skills、MCP 设置、hooks 或项目资源存在哪里时，
使用这份参考文档。

## 主目录

TraeX 路径会随环境变化。先检查这些变量：

- `TRAE_HOME`：很多部署里用于运行时主目录和缓存资源。
- `TRAECLI_HOME`：显式覆盖 CLI 私有运行时目录。未设置时通常是
  `$TRAE_HOME/cli`，用于插件缓存、skill 缓存、日志、sessions、memories 和相关
  CLI 状态。
- 如果任一变量被设置，优先使用变量值，不要直接假设默认主目录。

需要精确路径时，检查运行进程环境、`/status`、启动日志，或相关命令打印的路径。

## 日志

当前常见 TUI 日志位置：

```text
$TRAE_HOME/log/traecli-tui.log
```

不要把这个路径硬编码成所有构建的位置。部分环境可能使用不同主目录或日志文件名。
优先使用运行中 TUI、反馈包或启动输出显示的路径。除非已经实际观察到，否则不要说
日志在 `$TRAE_HOME/logs/`。

## 配置

常见检查位置：

- 用户配置：正常共享主目录下的 `~/.trae/traecli.toml`。
- 自定义部署里的用户配置：当前生效的 `TRAE_HOME` 下的 `traecli.toml`。
- 旧版用户配置可能从 `config.toml` 重命名或迁移到 `traecli.toml`。
- 命名配置档：`~/.trae/<profile>.traecli.toml`，通过 `traecli --profile <profile>`
  或 `traecli -p <profile>` 选择。
- 项目配置/资源：工作区下的 `.trae/`。
- 项目说明：项目根目录的 `AGENTS.md` 会作为项目指导注入。
- 运行时覆盖：命令行 `-c key=value` 参数。
- 环境覆盖：`TRAE_HOME`、`TRAECLI_HOME`、API endpoint 变量或鉴权相关环境变量。
- TUI 辅助入口：`/status` 查看当前会话有效状态；可用时用 `/debug-config` 查看配置层和来源。

配置行为异常时，要识别实际生效的配置层级，不要只读单个文件。

`~/.trae/` 下常见用户级共享资源：

```text
~/.trae/
  traecli.toml
  agents/
  skills/
  rules/
```

影响较大的 `traecli.toml` 配置项：

- `model`、`model_provider`、`model_reasoning_effort`、
  `model_reasoning_summary`、`model_verbosity`。
- `approval_policy`：`untrusted`、`on-failure`、`on-request` 或 `never`。
- `sandbox_mode`：`read-only`、`workspace-write` 或 `danger-full-access`。
- `[sandbox_workspace_write] network_access` 和 `writable_roots`。
- 命名配置档不写在 `profile` 或 `[profiles.<name>]` 里；这两个 legacy key 会导致
  启动时报错。把配置直接放到 `~/.trae/<profile>.traecli.toml`。
- `[[models]]` 和 `[models.<provider>]`，用于自定义或本地模型提供方；旧
  `[model_providers.<name>]` 只按历史兼容处理，不推荐新写。
- `[mcp_servers.<name>]`，用于 MCP server。
- `[memories]`，用于记忆生成和注入。关闭读取/注入用
  `use_memories = false`；关闭写入/生成用 `generate_memories = false`。不要把
  `[memories] enabled = false` 当作有效关闭方式。
- `[agents]`、`[[skills.config]]`、`[skills.bundled]` 和 hook event tables，用于能力接线。
- `[tui]` 和 `[tui.keymap]`，用于 UI 行为；`notifications`、
  `notification_method`、`notification_condition` 都写在 `[tui]` 下，不要写
  `[tui.notifications]`。
- `[history]`，用于会话持久化和清理。

临时覆盖配置用 `traecli -c key=value`。值按 TOML 解析，所以字符串值可能需要引号，
例如 `traecli -c model=\"gpt-5.1\"`。如果用户机器上的 `traecli` 仍是旧 Coco，就用
`traex` 做相同检查和覆盖。

## AGENTS.md

`AGENTS.md` 是项目指导文档，会作为 model-visible instruction 注入。TraeX 通常从当前
工作目录向上找到项目根，再按“项目根到当前工作目录”的顺序加载路径上的 `AGENTS.md`。
默认项目根标记是 `.git`；如果没有找到项目根标记，就只考虑当前工作目录。不会越过项目
根继续向上加载。

同一层级如果存在 `AGENTS.override.md`，它会作为本地 override 优先于 `AGENTS.md` 使用。
额外 fallback 文件名可通过 `project_doc_fallback_filenames` 配置。把
`project_doc_max_bytes` 设为 `0` 会关闭项目文档加载。

查看当前实际加载了哪些项目指导：

- TUI 里运行 `/status`，看 `Agents.md` 行。
- 需要排查配置层级或项目资源是否被信任时，用 `/debug-config` 和日志辅助确认。
- 发现预期文档没加载时，检查当前 cwd、项目根标记、目录信任状态，以及是否设置了
  `project_doc_max_bytes = 0`。

## 项目资源

工作区级资源常见位置：

```text
<workspace>/.trae/
  skills/
  agents/
  rules/
  hooks.json
  .mcp.json
  mcp.json
  .mcp.yaml
  mcp.yaml
```

兼容和迁移路径也可能从 `.coco`、`.agents` 或 `.trae-cn` 等外部 agent 目录复制或发现
资源。如果需要确认精确行为，检查当前生效配置和当前发布版本，不要假设所有兼容路径
都启用。

## 插件

已安装插件缓存通常位于当前生效的 CLI 主目录：

```text
$TRAECLI_HOME/plugins/cache/<marketplace>/<plugin>/<version>/
```

git-backed marketplaces 通常安装在：

```text
$TRAECLI_HOME/.tmp/marketplaces/<marketplace>/
```

直接本地安装使用 `local` 插件市场，并把元数据放在同一个
`.tmp/marketplaces/local/` 树下。

典型原生插件源码布局：

```text
plugin-name/
  .codex-plugin/plugin.json
  skills/
  .mcp.json
  hooks/hooks.json
  .app.json
  models/
```

插件清单可以指向自定义资源路径。常见清单字段包括 `skills`、`mcpServers`、
`models`、`apps` 和 `hooks`。如果清单没有设置 `hooks`，
TraeX 也会检查默认的 `hooks/hooks.json` 路径。

插件市场清单常见布局：

```text
.agents/plugins/marketplace.json
.agents/plugins/<plugin-name>/.codex-plugin/plugin.json
```

为了兼容，其他插件市场清单名称也可能被识别，包括
`.coco-plugin/marketplace.json`、`.trae-plugin/marketplace.json` 和
`.claude-plugin/marketplace.json`。

常用命令：

- `traecli plugin list`
- `traecli plugin install <source>`，用于本地路径或插件市场插件 id。
- `traecli plugin validate <plugin>`，用于已安装插件 id，例如
  `traecli plugin validate traex-guide` 或
  `traecli plugin validate traex-guide@TRAEX BD Plugins`。
- `traecli plugin validate --path <dir>`，用于插件源码目录。
- `traecli plugin enable <plugin>`
- `traecli plugin disable <plugin>`
- `traecli plugin uninstall <plugin>`
- `traecli plugin marketplace list`
- `traecli plugin marketplace list-plugins`
- `traecli plugin marketplace add <source>`
- `traecli plugin marketplace remove <name>`

多个插件市场里存在同名插件时，在插件命令中使用 `<plugin>@<marketplace>`。

向内置 BD 插件市场仓库贡献插件时，把插件放在：

```text
.agents/plugins/marketplace.json
.agents/plugins/<plugin-name>/.codex-plugin/plugin.json
.agents/plugins/<plugin-name>/skills/
.agents/plugins/<plugin-name>/.mcp.json
.agents/plugins/<plugin-name>/hooks/hooks.json
```

在该插件市场中，`marketplace.json` 条目应该指向仓库内插件目录，例如
`"path": "./.agents/plugins/<plugin-name>"`。新增插件市场或安装插件后，从隔离
TraeX 主目录验证已安装插件；不要假设每个 TraeX 发布版本都接受原始源码目录
作为 `plugin validate` 参数。

使用仓库里已有的插件市场条目形状：

```json
{
  "name": "my-plugin",
  "source": {
    "source": "local",
    "path": "./.agents/plugins/my-plugin"
  },
  "policy": {
    "installation": "AVAILABLE",
    "authentication": "ON_INSTALL"
  },
  "category": "Productivity"
}
```

只有需要内置插件市场自动安装的插件才使用 `"installation": "INSTALLED_BY_DEFAULT"`。

如果插件有意使用非默认 hooks 路径，在 `.codex-plugin/plugin.json` 中声明，例如
`"hooks": "./hooks.json"`。

## Skills

Skills 可能来自用户资源、项目资源或插件。

常见用户级 skill 位置：

```text
$TRAE_HOME/skills/<skill>/SKILL.md
```

常见项目级 skill 位置：

```text
<workspace>/.trae/skills/<skill>/SKILL.md
```

插件提供的 skill 通常位于插件缓存：

```text
$TRAECLI_HOME/plugins/cache/<marketplace>/<plugin>/<version>/skills/<skill>/SKILL.md
```

Skills 从 `SKILL.md` 文件发现。skill 旁边可以有参考文件或 scripts，但
`SKILL.md` 是入口。

在 TUI 中，可用时用 `/skills` 查看当前对模型可见的 skills。

## MCP

MCP 配置可能来自项目文件、用户配置或插件提供的文件。常见文件：

```text
<workspace>/.trae/.mcp.json
<workspace>/.trae/mcp.json
<workspace>/.trae/.mcp.yaml
<workspace>/.trae/mcp.yaml
plugin-name/.mcp.json
```

常用命令：

- `traecli mcp list`
- `traecli mcp get <name>`
- `traecli mcp add <name> -- <command> ...`
- `traecli mcp add <name> --url <url>`
- `traecli mcp remove <name>`
- `traecli mcp login <name>`
- `traecli mcp logout <name>`

MCP tools 不出现时，检查：

- 预期定义 server 的 MCP 配置文件。
- 如果 MCP server 来自插件，检查 active 插件缓存。
- server 命令、cwd、环境、启动超时和日志。
- 可用时检查 TUI 里的 `/mcp`。

## Hooks 和 Apps

插件源码文件可能包括：

```text
plugin-name/hooks/hooks.json
plugin-name/hooks.json
plugin-name/.app.json
```

项目级 hooks 常见位置：

```text
<workspace>/.trae/hooks.json
```

用户级 hooks 常见位置：

```text
$TRAECLI_HOME/hooks.json
```

TraeX 当前 hooks 事件、matcher、handler 字段、stdin/stdout 协议和排查细节见
`references/hooks.md`。路径问题只在这里回答；配置内容问题加载 `hooks.md`。

插件 hooks：默认读取 `hooks/hooks.json`，也可以在 `.codex-plugin/plugin.json` 里声明
`"hooks": "./hooks.json"`。`__PLUGIN_DIR__` 会指向 hooks 文件所在目录；如果需要插件根目录，
优先用 `${PLUGIN_ROOT}`。

安全的 hook 文件形状：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|apply_patch",
        "hooks": [
          {
            "type": "command",
            "command": "sh .trae/hooks/pre_tool.sh",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

把“解析成功”和“运行时真正生效”分开判断。如果 hook 或 app 行为不符合预期，检查插件
是否安装/启用、项目目录是否 trust、`/hooks` 里是否已信任该 hook，以及当前 TraeX 构建
是否支持对应能力路径。

## Feedback 和 Sessions

用 `/feedback` 为维护者打包诊断信息。反馈归档会先保存在本地；上传路径可用时也
可能上传。上传 base 可以通过这些变量覆盖：

```text
TRAE_CLI_FEEDBACK_UPLOAD_BASE_URL
TRAE_CLI_FEEDBACK_DOWNLOAD_BASE_URL
```

会话历史和 rollout 文件位于当前生效的 CLI 主目录。可用时用 `/rollout` 打印当前
rollout 路径，用 `traecli resume` 或 `/resume` 重新打开之前的会话。
