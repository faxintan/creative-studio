# 会话管理

## 会话命令

- `traecli resume`：恢复之前的交互式会话。
- `traecli fork`：从之前的交互式会话复刻一个分支会话。
- `traecli resume [SESSION_ID]`、`traecli resume --last`、`traecli resume --all`：恢复会话常用参数。
- `traecli fork [SESSION_ID]`：复刻会话。
- `/resume`：在 TUI 中恢复会话。
- `/fork`：复刻当前对话为新分支。
- `/rename`：重命名当前 thread。

## Coco 历史会话迁移

- 首次启动 TraeX / `traex` 时，会把旧版 Coco 的历史会话做一次同步。
- 首次同步之后，TraeX 不会持续读取 Coco 的新会话；Coco 和 TraeX 的 session id
  也不要按可互相恢复来理解。
- 如果用户拿 Coco 的 session id 在 TraeX 里恢复失败，先解释这是迁移边界，不要承诺
  后续会自动双向同步。
- 如果 Coco session 迁移不生效，这是已知问题，修复版本是 `0.200.12-alpha.2`；
  让用户升级 alpha 版本后重启再验证。
- `https://code.byted.org/copilot` 不是 TraeX CLI 会话详情入口。
- TUI 里可以用 `/trace` 打开当前 thread 的 Argos trace 观测页；`/share` 会分享当前
  Argos trace 并打开。
- Web 侧已有基于 Argos 的只读 session / trace 详情页，可看历史消息流、Context 和
  tool call 明细。它不是 Coco Web 同款运行时，不支持从网页侧 resume session 或继续执行。

## Backtrack 和 rewind

- 回溯/编辑上一条消息：输入框为空时连按 `Esc` 进入 backtrack。
- 回退工作区改动：`/rewind` 或别名 `/undo`。
- 撤销上一次 rewind：`/undo-rewind`。

## Transcript 和复制

- `Ctrl+O` 打开 transcript 浮层。
- `Alt+R` 或 `/raw` 切换 raw scrollback，方便直接复制纯文本。
- `/copy` 复制最近一条 agent 输出；`/copy N` 复制倒数第 N 条。

## 成功提示

- `Thread renamed to <name>, to resume this thread run traecli resume <name>`：`/rename` 成功。
- `Undo completed successfully.` / `Undo failed.`：`/rewind` 结果。
- `Side conversations are ephemeral and cannot be renamed.`：在 `/side` 临时对话里用了
  `/rename`；需要可重命名、可恢复或长期保留的分支时用 `/fork`。

`/btw` 和 `/side` 都适合不打断主对话的小问题。`/btw` 更像一次性旁路提问；`/side`
可以在临时旁路里多轮追问，但定位仍是临时会话。用户想“保留 side 后返回主对话”时，
优先建议 `/fork`，不要把 `/side` 说成可长期管理的会话分支。
