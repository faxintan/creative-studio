# 权限参考

## 权限模式和 Full Access

TraeX 不使用 Claude 风格的 `--dangerously-skip-permissions` 这个精确参数名，但有等价的高风险 full-access 路径：

- `traecli --dangerously-bypass-approvals-and-sandbox`
- `traecli exec --dangerously-bypass-approvals-and-sandbox "<prompt>"`
- `traecli --permission-mode bypass_permissions`
- TUI `/permissions` 里的 `Full Access` 模式，内部名称是 `full-access`

`--dangerously-bypass-approvals-and-sandbox` 会把审批策略设为 `never`，并把 sandbox 设为 danger/full access。`bypass_permissions` 是 CLI help 中允许 TraeX 编辑工作区外文件的 permission-mode 名称。TUI 里的 `Full Access` 表示 TraeX 可以编辑当前工作区外的文件，并且无需审批即可访问网络。

提醒用户这些模式会移除普通审批和沙箱保护。默认交互式使用时，优先使用普通工作区模式，并在需要访问工作区外文件时逐次批准。

## 切换授权和协作模式

- 精确选择权限模式时，用 `/permissions`。
- 快捷键 `Shift+Tab` 会循环切换协作模式，常见顺序包含 Plan、Auto-Review 和 Full Access；具体可用模式以当前版本 `/help` 为准。

## 推荐配置

日常开发推荐使用 workspace + on-request + auto-review，而不是默认 Full Access。这样 TraeX 可以在当前 workspace 内正常读写，遇到越权文件、网络、MCP 审批等请求时优先交给 auto-review 判断，仍保留必要的人类确认边界：

```toml
default_permissions = ":workspace"
approval_policy = "on-request"
approvals_reviewer = "auto_review"
```

`approvals_reviewer = "auto_review"` 表示审批请求先路由给自动评审器。当前实现也兼容历史值 `guardian_subagent`，但新配置推荐写 `auto_review`。配置后在 TUI 里运行 `/status`，`Permissions` 行应显示类似 `Workspace (auto-review)`。如果只想本次会话临时切换，用 `/permissions` 或 `Shift+Tab` 切到 Auto-Review 模式。

需要更少人工授权时，优先把明确安全的 workspace 范围配置好，而不是直接开 Full Access。如果任务经常需要读写额外目录，启动时用 `traecli --add-dir <dir>`，或在 workspace 权限配置里加入明确的可写根目录。只有在可信、隔离环境中才建议用 Full Access。

如果点击 `Yes, and switch to Auto mode` 或
`Yes, and switch to Full Access Mode` 后没有生效，按已知 bug 处理，当前正在修复。
用户也可能描述为 default mode / default 模式中途切换 mode 后仍反复弹选择、选择
`3` 多次仍没有生效、预期“不再向我提问”或“直接开干”但没有发生。这类问题属于
权限 / 审批模式切换未即时生效，不按普通 TUI 交互问题路由。
推荐替代措施：

- 方式一：在 TUI 里运行 `/permissions`，手动选择目标 mode。
- 方式二：直接修改 `~/.trae/traecli.toml`，设置目标 mode 对应的长期自动审批配置。

```toml
sandbox_mode = "danger-full-access" # 也可以按需要改成 "workspace-write" 或 "read-only"
approval_policy = "on-request"
approvals_reviewer = "auto_review" # AI 审批；如果要用户自己审批，改成 "user"
```

修改后重启 TraeX，再用 `/status` 或 `/permissions` 确认生效。

## 常见权限报错

- 输出含 `permission denied` / `operation not permitted`：当前 sandbox 或权限配置不允许该操作。用 `/permissions` 调整，或在提示时批准；写文件通常需要 workspace-write。
- `Network access to "<host>" was blocked: ...`：联网被 sandbox 策略拦截。检查 `[sandbox_workspace_write] network_access`、权限档和域名审批。
- `This action was rejected due to unacceptable risk.`：auto-review 判定风险过高。只有用户接受风险时才用 `/approve` 批准一次重试，否则换更安全的做法。
- `The automatic permission approval review did not finish before its deadline.`：auto-review 超时；可重试或在合适时显式批准。
