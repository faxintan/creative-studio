# Model Provider 配置

## 基本配置

新增自定义模型时，只推荐使用 Coco 兼容配置形式：顶层 `model` / `model_provider`、
`[[models]]` 模型元信息，以及 `[models.<provider>]` 连接信息。

旧的 Codex 原生 `[model_providers.*]` 写法已废弃。它可能仍能兼容历史配置，但不要在
新配置、FAQ 或排障建议里继续展开。

`harness_mode` 和 `context_window` 不是装饰字段，必须按模型真实能力认真填写：

- `harness_mode` 影响系统提示词、工具协议、历史消息组织和模型行为风格。配置错了，
  请求可能仍然成功，但工具调用、输出风格、指令遵循和上下文处理都会变差。
- `context_window` 影响 `/context`、compact 触发和长上下文预算。写得过大会晚 compact
  并增加服务端超窗风险；写得过小会过早 compact，浪费模型真实上下文。
- `context_window` 不是“input window”单独口径，按模型侧总上下文预算理解。长输出模型还要
  同时设置 `output_tokens_hard_limit` 和 provider block 里的 `max_tokens`。

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

改完配置或环境变量后重启 TraeX，用 `/status` 确认当前生效的 `model`、`provider`、
`harness_mode` 和 `base_url`。

如果只是临时验证，可以用命令行 override：

```bash
traecli -c model_provider="custom" -c model="my-model"
```

如果 `traecli` 仍是旧 Coco，就把命令改成 `traex`。

项目级配置也可以写在 `<repo>/.trae/traecli.toml`。排查配置不生效时，同时检查用户级配置、项目级配置、命令行 `-c` override，以及项目是否被信任。

API key 不建议写明文。优先用环境变量占位：

```bash
export MY_API_KEY="..."
```

同一个 provider 支持多个模型时，写多个 `[[models]]` 条目，并让每个条目的 provider
block 使用真实上游模型名。`/model` 会按 `[[models]].name` 展示和切换：

```toml
model = "coding"
model_provider = "custom"

[[models]]
name = "coding"
context_window = 128000
harness_mode = "codex"

[[models]]
name = "planning"
context_window = 128000
harness_mode = "codex"

[models.open_ai]
base_url = "https://api.example.com/v1"
api_key = "${MY_API_KEY}"
max_tokens = 16384
```

如果 provider 需要为不同展示名映射不同上游模型名，让用户直接把完整接口信息交给 TraeX
配置；不要猜 provider 私有字段。核心原则是：TraeX 展示名来自 `[[models]].name`，真实
请求模型名来自 provider block 的 `model` 或 `extra_fields.model` 等协议字段。

## Chat Completions / OpenAI-compatible

如果 provider 接受 OpenAI-compatible Chat Completions 请求，使用 `[models.open_ai]`：

```toml
model = "my-chat-model"
model_provider = "custom"

[[models]]
name = "my-chat-model"
context_window = 128000
output_tokens_hard_limit = 16384
harness_mode = "codex"

[models.open_ai]
base_url = "https://api.example.com/v1"
api_key = "${MY_CHAT_API_KEY}"
max_tokens = 16384
```

## Responses API

如果 provider 明确接受 Responses API 请求，使用 `[models.byted_gpt]`：

```toml
model = "my-responses-model"
model_provider = "custom"

[[models]]
name = "my-responses-model"
context_window = 128000
output_tokens_hard_limit = 16384
harness_mode = "codex"

[models.byted_gpt]
base_url = "https://api.example.com/v1"
api_key = "${MY_RESPONSES_API_KEY}"
max_tokens = 16384
```

不要把 Chat Completions 的 `messages` endpoint 配成 `[models.byted_gpt]`。

火山方舟同时支持 Responses API 和 Chat Completions。两种协议都可以接，但要按
服务端 endpoint 选择对应 provider block，不要混用。

Responses API 已验证写法：

```toml
model = "ark-responses-vision"
model_provider = "custom"

[[models]]
name = "ark-responses-vision"
context_window = 128000
harness_mode = "codex"
supported_mime_types = ["image/*"]

[models.byted_gpt]
base_url = "https://ark-cn-beijing.bytedance.net/api/v3"
api_key = "${ARK_API_KEY}"
model = "ep-20241213170716-6hgxc"
max_tokens = 16384
```

方舟 Responses endpoint 是 `https://ark-cn-beijing.bytedance.net/api/v3/responses`。
TraeX 会在 `[models.byted_gpt].base_url` 后追加 `/responses`，所以配置里写到
`/api/v3` 即可。`api_key = "${ARK_API_KEY}"` 会从环境变量读取 key，并按默认
Responses 鉴权发送 `Authorization: Bearer <key>`。

`model = "ep-..."` 是真实方舟 endpoint id；`[[models]].name` 是 TraeX 里展示和选择
用的名称，两者可以不同。图片输入是否可用取决于该 endpoint 是否支持 vision。

Chat Completions 已验证写法：

```toml
model = "ark-chat-vision"
model_provider = "custom"

[[models]]
name = "ark-chat-vision"
context_window = 128000
harness_mode = "codex"
supported_mime_types = ["image/*"]

[models.open_ai]
base_url = "https://ark-cn-beijing.bytedance.net/api/v3"
api_key = "${ARK_API_KEY}"
model = "ep-20241213170716-6hgxc"
max_tokens = 16384
```

方舟 Chat Completions endpoint 是
`https://ark-cn-beijing.bytedance.net/api/v3/chat/completions`。TraeX 会在
`[models.open_ai].base_url` 后追加 `/chat/completions`，所以配置里写到 `/api/v3`
即可。`api_key = "${ARK_API_KEY}"` 会从环境变量读取 key，并按默认
OpenAI-compatible 鉴权发送 `Authorization: Bearer <key>`。

图片输入是否可用取决于该 endpoint 是否支持 vision。Chat Completions 协议按
`image_url` / `text` 形态发送图片和文本。

上面两份方舟配置已通过原生 curl 和 TraeX Coco 兼容配置验证：Responses 与
Chat Completions 都能完成请求。

## Anthropic Messages

如果 provider 提供 Anthropic Messages API，使用 `[models.claude]`：

```toml
model = "claude-compatible-model"
model_provider = "custom"

[[models]]
name = "claude-compatible-model"
context_window = 200000
harness_mode = "claudecode"

[models.claude]
base_url = "https://relay.example.com/v1"
api_key = "${MY_ANTHROPIC_API_KEY}"
```

## Gemini

如果 provider 使用 Gemini `generateContent` 协议，使用 `[models.gemini]`：

```toml
model = "gemini-compatible-model"
model_provider = "custom"

[[models]]
name = "gemini-compatible-model"
context_window = 1000000
harness_mode = "claudecode"

[models.gemini]
base_url = "https://api.example.com"
api_key = "${MY_GEMINI_API_KEY}"
```

Gemini 类 provider 的 `base_url`、model name 和鉴权方式要以 provider 文档为准。

## ModelHub Responses API

标准 header 已验证写法：

```toml
model = "gpt-5.4-modelhub-responses"
model_provider = "custom"

[[models]]
name = "gpt-5.4-modelhub-responses"
context_window = 272000
output_tokens_hard_limit = 16384
harness_mode = "codex"

[models.byted_gpt]
base_url = "https://aidp.bytedance.net/api/modelhub/online"
api_key = "${MODELHUB_RESPONSES_AK}"
model = "gpt-5.4-2026-03-05"
max_tokens = 16384
headers = { "X-TT-LOGID" = "traex-modelhub-responses-${SESSION_ID}" }
```

ModelHub Responses endpoint 是 `https://aidp.bytedance.net/api/modelhub/online/responses`。
TraeX 会在 `[models.byted_gpt].base_url` 后追加 `/responses`，所以标准 header 配置里
`base_url` 写到 `/online` 即可。

`api_key = "${MODELHUB_RESPONSES_AK}"` 会从环境变量读取 key，并按默认 Responses 鉴权
发送 `Authorization: Bearer <key>`。如果网关要求 `api-key` header，也可以加
`by_azure = true`；两种 header 写法都已通过 TraeX 验证。

`model = "gpt-5.4-2026-03-05"` 是当前已验证能通的 ModelHub Responses 模型名。
`glm-5.1` 在 Responses 路径会返回 `the current product doesn't support response API`。

query AK 已验证写法：

```toml
model = "gpt-5.4-modelhub-responses-query"
model_provider = "custom"

[[models]]
name = "gpt-5.4-modelhub-responses-query"
context_window = 272000
harness_mode = "codex"

[models.byted_gpt]
base_url = "https://aidp.bytedance.net/api/modelhub/online/responses?ak=${MODELHUB_RESPONSES_AK}&_coco_path="
model = "gpt-5.4-2026-03-05"
max_tokens = 16384
headers = { "X-TT-LOGID" = "traex-modelhub-responses-${SESSION_ID}" }
```

query AK 场景不能写成 `https://aidp.bytedance.net/api/modelhub/online?ak=...`。TraeX
当前会把 `/responses` 追加到 query 后面，变成 `?ak=.../responses`，导致 404。应写完整
`/responses?ak=...&_coco_path=`，让 TraeX 追加的 `/responses` 被 `_coco_path` 吸收。

## ModelHub crawl

ModelHub crawl endpoint 常见是完整 POST path，不是标准 `/v1/chat/completions` base URL。
先用 curl 确认服务端接受的是 Chat Completions 还是 Responses 请求体。

当前已验证的 crawl endpoint 接受 Chat Completions 风格的 `messages + max_tokens`，返回
`chat.completion`；使用 Responses 风格 `input + max_output_tokens` 会报 `Messages`
required。因此应使用 `[models.open_ai]`：

```toml
model = "glm-5.1-modelhub-crawl"
model_provider = "custom"

[[models]]
name = "glm-5.1-modelhub-crawl"
context_window = 272000
harness_mode = "codex"

[models.open_ai]
base_url = "https://aidp.bytedance.net/api/modelhub/online/v2/crawl?ak=${MODELHUB_CRAWL_AK}&_coco_path="
max_tokens = 16384
headers = { "X-TT-LOGID" = "traex-${SESSION_ID}" }

[models.open_ai.extra_fields]
model = "glm-5.1"
```

`_coco_path=` 用来吸收 TraeX 自动追加的 `/chat/completions`，让真实请求 path 仍停在
`/api/modelhub/online/v2/crawl`。`extra_fields.model` 用真实上游模型名覆盖展示名。

`context_window` 是 TraeX 客户端侧预算认知，影响 `/context`、compact 和模型列表展示；
它不会放大服务端真实上下文窗口。配置错会直接影响长上下文效果和 compact 时机。ModelHub
这类自定义模型建议按平台标注的真实 window 填；拿不准就先填保守值。需要 1M 级模型且
输出上限为 128K 时，常见写法是 `context_window = 872000`、
`output_tokens_hard_limit = 128000`，并在 provider block 中设置 `max_tokens = 128000`。

## 图片和附件

图片能不能用有两层条件：

1. `[[models]]` 里要声明这个自定义模型接受图片输入：

```toml
[[models]]
name = "my-vision-model"
context_window = 128000
harness_mode = "codex"
supported_mime_types = ["image/*"]
```

TraeX 会把 `supported_mime_types = ["image/*"]` 或具体的 `image/png`、
`image/jpeg` 转成最终模型 catalog 的 `input_modalities = ["text", "image"]`。
TUI 粘贴图片和提交前检查看的是最终 `input_modalities`。如果没有 `image`，会在本地提示
`Model ... does not support image inputs`，并且不会向模型发起请求。

2. provider 也必须支持当前 provider block 对应协议里的图片 payload：

- `[models.open_ai]`：按 OpenAI-compatible Chat Completions 的多模态 message 格式发送图片。
- `[models.byted_gpt]`：按 Responses API 的输入格式发送图片。
- `[models.claude]`：按 Anthropic Messages 的 image content block 发送图片。
- `[models.gemini]`：按 Gemini `generateContent` 的 parts 格式发送图片。

自定义 provider 不应默认依赖 Trae 专有上传链路。普通文本能通但图片失败时，优先确认
provider 本身是否支持该模型的 vision 能力、该网关是否接受对应协议的图片字段、图片格式
和大小是否被网关允许。

## 切换和验证

写完配置后：

1. 在启动 TraeX 的 shell 里 export API key。
2. 重启 TraeX，让新配置和环境变量生效。
3. 用 `/status` 确认 `model`、`provider`、`harness_mode`、`base_url`、权限模式等当前状态。
4. 用 `/model` 确认模型列表和当前选中模型。
5. 图片输入场景用 `traex debug models --remote` 确认目标模型的 `input_modalities`
   包含 `"image"`。
6. 临时验证时用 `traecli -c model_provider="custom" -c model="my-model"`；如果 `traecli`
   被旧 Coco 占用，改用 `traex`。

如果失败但不好复现，让用户在出问题的 session 里执行 `/feedback`，并附上已脱敏的
Coco 兼容模型配置块、TraeX 版本、模型 id、provider block、base_url 域名、错误信息和
request id / log id。

## 常见排查

- 用 `/status` 确认当前 `model`、`provider` 和 `base_url`。
- 用 `/model` 确认模型是否出现在列表里。
- 检查顶层 `model` 是否等于某个 `[[models]].name`。
- 检查 `model_provider = "custom"` 是否生效。
- 检查 `harness_mode` 是否符合模型应该使用的 harness；请求通不代表 harness 合适。
- 检查 `context_window` 是否按服务端真实能力填写；不要为了显示更大窗口随意写大。
- 检查 API key 对应的环境变量是否已在启动 TraeX 的 shell 里 export。
- 检查 `[models.open_ai]`、`[models.byted_gpt]`、`[models.claude]`、`[models.gemini]`
  是否匹配 provider 的真实协议。
- 检查 `base_url` 是否符合 provider 协议。标准 OpenAI-compatible / Anthropic-compatible
  常见是带 `/v1`，完整 POST path 需要像 ModelHub crawl 一样特殊处理。
- 404 `Model not found` 多半说明 provider 侧模型名或路由不存在，先核对 `model` 字段和网关模型名映射。
- 文本能通但图片不通时，按“图片和附件”小节先确认 `supported_mime_types` 已声明图片输入，
  再确认 vision 能力、协议图片格式、图片大小和网关限制。
- 旧 `[model_providers.*]` 配置已废弃；新问题优先改成 Coco 兼容配置再排查。
- 配置里不要粘贴 secrets；需要发给别人排查时先脱敏。
