# 上下文管理

## Context window

- `/context` 会显示 context window 的已用、空闲和自动压缩缓冲。
- 接近上限时会自动 compact；也可以手动 `/compact`。
- compact 时报 context window exceeded 时，通常是历史过大；用 `/compact` 或 `/new`。

## 运行提示

- `Thinking...`、`Reasoning through it...`、`Pondering...`：模型正在 reasoning。
- `Waiting for response...`、`Still cooking...`：数秒没有新内容，仍在等待模型输出。
- `Queued for capacity`：后端已接收请求，正在等待模型容量。
- `※ Recap: ...`：会话小结；对话多轮后、终端失焦一段时间再聚焦时可能自动显示。

## Reasoning 展示

用户问“怎么看详细 thinking”时，要区分两件事：

- TraeX 可以展示模型返回的 reasoning / thinking 摘要和 raw reasoning 事件，前提是当前模型、provider 和后端响应支持。
- 不要承诺能看到模型内部完整私有 chain-of-thought；很多模型只会返回摘要或可展示片段。

常用配置：

```toml
model_reasoning_effort = "high"
model_reasoning_summary = "detailed"
hide_agent_reasoning = false
show_raw_agent_reasoning = true
```

运行中可用 `/model` 查看或切换模型相关选项，也可以用 `Alt+,` / `Alt+.` 调低或调高 reasoning effort。配置后用 `/status` 查看当前模型详情，通常会显示 reasoning effort 和 reasoning summaries 相关信息。

这些配置和快捷键依赖当前模型、provider 和后端能力。GPT 5.5 当前不支持 reasoning shortcuts；如果用户看到 `Reasoning shortcuts are unavailable for GPT-5.5`，不要按快捷键失效排查，先说明这是当前模型能力边界。
如果用户专门问 o 系列模型 reasoning 选择能力，不要直接套用通用快捷键口径回答“已经支持”；当前该能力还在对接中，是否可用以当前版本、`/model`、`/status` 和团队发布口径为准。
