# MCP 集成

## TUI 和 CLI 入口

- `/mcp`：查看当前 MCP servers/tools 状态。
- `/mcp verbose`：查看更详细的 MCP 信息。
- `traecli mcp list`、`traecli mcp get <name>`、`traecli mcp add ...`、`traecli mcp remove <name>`、`traecli mcp login <name>`、`traecli mcp logout <name>`：管理外部 MCP server。

## 配置

```toml
[mcp_servers.filesystem]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-filesystem", "/path"]
env = { FOO = "bar" }
enabled = true
startup_timeout_sec = 30.0
tool_timeout_sec = 10.0
default_tools_approval_mode = "prompt"
enabled_tools = ["read_file"]
disabled_tools = ["delete"]

[mcp_servers.remote]
url = "https://mcp.example.com"
bearer_token_env_var = "MCP_TOKEN"
http_headers = { "X-Org" = "trae" }
```

MCP 常用配置包括 `enabled`、`required`、`startup_timeout_sec`、`tool_timeout_sec`、`default_tools_approval_mode`、`enabled_tools`、`disabled_tools`、`scopes` 和 `oauth_resource`。OAuth 存储相关配置包括 `mcp_oauth_credentials_store`、`mcp_oauth_callback_port` 和 `mcp_oauth_callback_url`。

## 常见问题

- `The <server> MCP server is not logged in. Run ... mcp login <server>.`：登录对应 MCP server。
- MCP tools 不出现时，检查 MCP 配置来源、server 命令、cwd、环境、启动超时和日志。
