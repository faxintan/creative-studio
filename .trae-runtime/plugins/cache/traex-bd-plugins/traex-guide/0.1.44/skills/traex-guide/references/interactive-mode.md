# 交互模式（Interactive Mode）

## 图片和粘贴

- TUI 中可以粘贴图片：`Ctrl+V`，macOS 也支持 `Cmd+V`，Windows 支持 `Ctrl+V`。图片会作为附件加入当前消息。
- 启动时给初始提示附加图片，用 `traecli -i <file> "<prompt>"`；多个文件可用逗号分隔。
- 粘贴大段文本时，输入框可能折叠为 `[Pasted Content N chars]` 占位符；完整内容会在提交时展开，用来避免 TUI 刷屏。

## 输入框和对话控制

- 发送消息：`Enter`。
- 多行输入：`Shift+Enter`、`Ctrl+J` 或 `Alt+Enter` 插入换行；终端不支持 `Shift+Enter` 时，运行 `/terminal-setup` 安装键位绑定。
- 任务运行期间排队下一条消息：输入内容后按 `Tab`。当前回合结束后会自动发送。
- 编辑最近排队的消息：`Alt+Up` 或 `Shift+Left`。
- 中断当前任务：`Esc` 或 `Ctrl+C`。
- 回溯/编辑上一条消息：输入框为空时连按 `Esc` 进入 backtrack。
- 回退工作区改动：`/rewind` 或别名 `/undo`；撤销上一次 rewind 用 `/undo-rewind`。

## 输入框特殊符号

- `/`：打开 slash 命令弹窗。
- `@`：打开文件检索弹窗，把项目文件提及给 agent 作为上下文。
- `!`：进入 shell 命令模式，例如 `!ls`。
- `$`：打开 connector / plugin 弹窗。

弹窗里通常用 `↑` / `↓`、`Ctrl+P` / `Ctrl+N` 或 `k` / `j` 移动，`Enter` 选中，`Esc` 关闭。

## 查看和复制历史输出

- `Ctrl+O` 打开 transcript 浮层，支持 `↑` / `↓`、`PageUp` / `PageDown`、`Home` / `End` 浏览，`q` 关闭。
- `Alt+R` 或 `/raw` 切换 raw scrollback，方便直接复制纯文本。
- `/copy` 复制最近一条 agent 输出；`/copy N` 复制倒数第 N 条。

## 状态栏和标题栏

底部状态行可用 `/statusline` 自定义，常见显示模型与 reasoning effort、工作目录/项目根、Git 分支与 diff、权限/审批模式、上下文占用、额度、thread 标题、token 用量和版本号。终端标题栏显示项用 `/title` 配置。
