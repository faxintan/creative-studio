# 配置参考

## 配置文件

主配置文件通常是 `~/.trae/traecli.toml`，格式是 TOML。常见共享资源目录：

```text
~/.trae/
  traecli.toml
  agents/
  skills/
  rules/
```

受信任项目里的项目级配置可以覆盖用户配置；项目根上的 `AGENTS.md` 会作为项目指导注入。命令行临时覆盖用 `-c key=value`，例如 `traecli -c model="gpt-5.1"`。

## 常用顶层配置项

- `model`、`model_provider`：默认模型和 provider。
- `model_reasoning_effort`：reasoning effort，常见值为 `none`、`minimal`、`low`、`medium`、`high`、`xhigh`。
- `model_reasoning_summary`：reasoning summary，常见值为 `auto`、`concise`、`detailed`、`none`。
- `model_verbosity`：输出长度，常见值为 `low`、`medium`、`high`。
- `model_context_window`：覆盖模型默认 context window。
- `personality`：沟通风格，常见值为 `none`、`friendly`、`pragmatic`。
- `instructions`：追加到模型提示中的系统指令。
- `notify`：通知用户的外部命令。
- `file_opener`：文件链接打开方式，常见值为 `vscode`、`vscode-insiders`、`windsurf`、`cursor`、`none`。
- `hide_agent_reasoning`：是否隐藏 agent reasoning。
- `project_doc_max_bytes`：从 `AGENTS.md` 读取的最大字节数；设为 `0` 可关闭加载。
- `check_for_update_on_startup`：启动时是否检查更新。

## 审批和 sandbox

```toml
approval_policy = "on-request"
sandbox_mode = "workspace-write"

[sandbox_workspace_write]
network_access = false
writable_roots = []
exclude_tmpdir_env_var = false
exclude_slash_tmp = false
```

`permission_mode` 是已废弃配置，优先使用 `default_permissions`、`approval_policy` 和 `approvals_reviewer`。

## 配置档

配置档不再写在主配置里的 `profile` 或 `[profiles]` 下。主配置
`~/.trae/traecli.toml` 里出现这两个 legacy key 时，TraeX 会拒绝启动并提示移动到
`<profile>.traecli.toml`。

使用配置档时，把配置直接写入 `~/.trae/<profile>.traecli.toml`，启动时用
`traecli --profile <profile>` 或 `traecli -p <profile>` 选择。

例如 `~/.trae/work.traecli.toml`：

```toml
model = "gpt-5.1"
approval_policy = "on-request"
sandbox_mode = "workspace-write"
```

例如 `~/.trae/yolo.traecli.toml`：

```toml
approval_policy = "never"
sandbox_mode = "danger-full-access"
```

配置档内可覆盖 `model`、`model_provider`、`approval_policy`、`sandbox_mode`、
`model_reasoning_effort`、`model_reasoning_summary`、`model_verbosity`、
`personality`、`default_permissions`、`tools`、`web_search` 等。

## 自定义模型

新增自定义模型只推荐 Coco 兼容配置形式。旧的 Codex 原生 `[model_providers.*]`
写法已废弃，不要在新配置或 FAQ 中继续展开。

```toml
model = "my-model"
model_provider = "custom"

[[models]]
name = "my-model"
context_window = 128000
output_tokens_hard_limit = 16384
harness_mode = "codex"

[models.open_ai]
base_url = "https://api.example.com/v1"
api_key = "${MY_API_KEY}"
max_tokens = 16384
```

`harness_mode` 是推荐的模式选择字段；旧的 `model_family` 和 `prompt_hint` 已废弃，
只在历史配置兼容场景中出现。`context_window` 是客户端侧预算认知，不会放大服务端真实
窗口；拿不准时填保守值。长输出模型同时配置 `output_tokens_hard_limit` 和 provider
里的 `max_tokens`。具体 provider 示例见 `model-providers.md`。

## TUI 配置

```toml
[tui]
theme = "monokai-pro"
animations = true
vim_mode_default = false
raw_output_mode = false
alternate_screen = "auto"
session_picker_view = "dense"
composer_edge_style = "line"
notifications = true
notification_method = "auto"
notification_condition = "unfocused"

[tui.keymap]
# global / composer / editor / vim_normal / vim_operator / pager / list / approval
```

对应 TUI 命令包括 `/keymap`、`/theme`、`/statusline` 和 `/title`。

`composer_edge_style = "line"` 可以作为终端背景探测异常时的规避配置。比如在
Docker、SSH 或部分终端组合里，输入框边缘可能出现错误白线；先改成普通横线样式，
再收集 `/feedback`、终端类型、`TERM` 和是否 SSH / 容器环境。

## History 和其它常用项

```toml
cleanup_period_days = 30
show_session_recap = true

[history]
persistence = "save-all"
max_bytes = 104857600
```

- `commit_attribution`：提交的 Co-author 尾注；设为空字符串可禁用。
- `web_search`：联网搜索模式，常见值为 `disabled`、`cached`、`live`。
- `resource_dirs`：共享资源目录，默认常见为 `[".trae", ".agents"]`。
- `project_root_markers`：判定项目根的标记，默认常见为 `[".git"]`。
- `cli_auth_credentials_store`：登录凭据存储，常见值为 `file`、`keyring`、`auto`、`ephemeral`。
- `[features]`：实验性功能开关，也可用 `/experimental` 或 `traecli features` 管理。
