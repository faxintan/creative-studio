# 环境健康检查（doctor）

## 入口

- `/doctor`：TUI 内执行 CLI 诊断和环境检查。
- `traecli doctor`：命令行收集本地诊断信息。

## 常见首轮检查

1. TraeX 版本和使用的命令，可来自启动输出、`traecli --version` / `traex --version` 或反馈数据。
2. 工作目录。
3. `TRAE_HOME` 和 `TRAECLI_HOME`。
4. 最近的本地日志路径和片段。
5. 可用时的 `/status` 输出。
6. 已脱敏的相关 `traecli.toml` 或项目 `.trae/` 配置。
7. 难以复现时的 `/feedback` 包。
8. 问题出现在 TUI、`traecli exec` / `traex exec`、app-server、MCP、插件加载，还是只出现在某个模型/provider 路径。
