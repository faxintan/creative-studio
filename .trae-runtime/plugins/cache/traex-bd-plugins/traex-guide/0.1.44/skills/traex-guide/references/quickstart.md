# 快速入门

## 命令怎么选

面向用户的正式命令名仍是 `traecli`。升级过渡期里，部分机器上的 `traecli` 可能仍然是旧版
Coco，或者被旧版重新占用；如果用户只想稳定启动新版、验证新版是否安装成功，或反馈里已经
出现旧版 UI/行为，用 `traex` 这个不冲突的命令名。

共存期间给用户可复制命令时，如果不确定 `traecli` 是否已切到新版，优先写 `traex`；确认
`traecli --version` 已是 TraeX 后，再用 `traecli`。

## 基础命令

- 启动交互式 TUI：`traecli`
- 启动 TUI 并发送初始提示：`traecli "帮我修复登录的 bug"`
- 非交互式运行一个任务：`traecli exec "<prompt>"`
- 显式选择模型：`traecli -m <model>` 或 `traecli exec -m <model> "<prompt>"`
- 给初始提示附加图片：`traecli -i screenshot.png "<prompt>"`
- 使用配置档：`traecli -p <profile>`
- 从指定目录运行：`traecli -C <dir>` 或 `traecli exec -C <dir> "<prompt>"`。长参数是 `--cd <dir>`。
- 为当前会话增加额外可写目录：`traecli --add-dir <dir>`
- 临时覆盖配置：`traecli -c key=value`
- 查看帮助：`traecli --help`、`traecli exec --help`

准确参数可能随版本变化。用户需要可复制命令时，以用户机器上的 `traecli --help` 为准。如果 `traecli` 仍是旧版 Coco，就改看 `traex --help` 并替换命令名。

## 第一次使用

1. 运行 `traecli`；如果它仍是旧 Coco、界面不同或命令不识别，用 `traex`。
2. 在输入框里直接输入需求，按 `Enter` 发送。
3. 用 `/help` 或 `?` 查看当前 TUI 支持的命令和快捷键。
4. 用 `/status` 查看当前模型、目录、权限、collaboration mode 和 `AGENTS.md` 状态。
5. 用 `/skills`、`/plugins` 和 `/mcp` 查看已安装能力。
6. 上报 bug 或差回答时用 `/feedback`。
7. 脚本、CI 风格检查或一次性任务用 `traecli exec "<prompt>"`。
