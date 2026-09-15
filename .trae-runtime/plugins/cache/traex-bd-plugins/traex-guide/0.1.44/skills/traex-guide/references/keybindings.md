# 键盘快捷键

## 常用 TUI 快捷键

- 输入 `/` 打开命令弹窗；Tab 自动补全 slash 命令。
- 输入 `@` 打开文件检索弹窗；输入 `$` 打开 connector / plugin 弹窗。
- 消息以 `!` 开头，可以从 TUI 运行 shell 命令。
- 按 `?` 查看键盘快捷键。
- 按 `Ctrl+G` 在 `$EDITOR` 中编写或编辑消息。
- 按 `Ctrl+L` 清屏或刷新界面。
- 按 `Ctrl+R` 搜索提示历史。
- 在历史搜索中按 `Ctrl+S` 跳到下一个匹配。
- 按 `Ctrl+T` 打开进程管理。
- 按 `Ctrl+O` 打开 transcript 视图。
- 按 `Alt+R` 或运行 `/raw` 切换 raw 输出模式。
- 按 `Ctrl+D` 退出当前 CLI。
- 按 `Shift+Tab` 循环切换协作模式，常见包含 Plan / Auto-Review / Full Access。
- 粘贴图片用 `Ctrl+V`；macOS 也支持 `Cmd+V`。
- 插入换行而不发送，可用 `Shift+Enter`、`Ctrl+J` 或 `Alt+Enter`。
- 按 `Esc` 中断当前回合；输入框为空时连按可进入回溯。
- 按 `Alt+,` / `Alt+.` 降低或提高 reasoning effort；该能力取决于当前模型和
  provider，GPT 5.5 当前不支持 reasoning shortcuts。
- 按 `Alt+Left` / `Alt+Right` 在多智能体线程中切换上一个 / 下一个。

## 输入框内常用编辑键

- 光标移动：`←` / `Ctrl+B`，`→` / `Ctrl+F`。
- 上下移动或翻历史：`↑` / `Ctrl+P`，`↓` / `Ctrl+N`。
- 按词移动：`Alt+B` / `Ctrl+←`，`Alt+F` / `Ctrl+→`。
- 行首/行尾：`Home` / `Ctrl+A`，`End` / `Ctrl+E`。
- 删除字符：`Backspace` / `Ctrl+H` 向前删，`Delete` / `Ctrl+D` 向后删。
- 删除词：`Ctrl+W` / `Alt+Backspace` 向前删，`Alt+D` / `Ctrl+Delete` 向后删。
- 删除到行首/行尾：`Ctrl+U` / `Ctrl+K`。
- 粘贴删除缓冲区：`Ctrl+Y`。

## 审批弹窗常用键

- `y`：同意一次。
- `a`：本 session 内同意。
- `p`：对该命令前缀同意。
- `d`：拒绝。
- `Esc` / `n`：拒绝或取消。
- `o`：跳转到相关消息。
- `Ctrl+A`：全屏查看审批详情。

## Transcript 浮层常用键

- `↑` / `k` 和 `↓` / `j`：上下滚一行。
- `PageUp` / `Ctrl+B` 和 `PageDown` / `Space` / `Ctrl+F`：上下翻一页。
- `Ctrl+U` / `Ctrl+D`：上下翻半页。
- `Home` / `End`：跳到顶部/底部。
- `q` / `Ctrl+C`：关闭浮层。

## Vim 模式

- 用 `/vim` 开关，或配置 `tui.vim_mode_default = true` 默认开启。
- 开启后输入框是模态编辑；默认插入模式，`Esc` 进入 normal 模式。
- Normal 模式常用键：`i` / `a` / `A` / `I` / `o` / `O` 进入插入，`h` / `j` / `k` / `l` 移动，`w` / `b` / `e` 按词移动，`0` / `$` 到行首/行尾，`x` 删字符，`D` 删到行尾，`yy` / `Y` 复制行，`p` 粘贴，`dd` 删行。
