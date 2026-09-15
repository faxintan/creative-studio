# 会话反馈

## 上报入口

- `/feedback`：把日志和诊断信息发送给维护者。

## 成功和失败提示

- `/feedback` 成功时会显示反馈已提交、日志归档链接和 thread id。
- 上传失败时可能显示 `Feedback recorded (no logs).` 并保留本地归档。

## 上报 Bug 时保留

- TraeX 版本/commit，以及显示的 dirty state。
- 命令、cwd、homes 和相关环境。
- 最小复现步骤。
- 已脱敏的相关配置。
- 日志片段和 logid/error id。
- 可用时的反馈包。
- 行为是本地实时复现，还是反馈回放。
