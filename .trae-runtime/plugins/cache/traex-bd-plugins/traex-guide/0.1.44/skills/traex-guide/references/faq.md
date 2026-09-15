# TraeX FAQ

这份文档用于快速解答 TraeX 高频问题。优先给用户可执行的命令或操作；如果问题
依赖本机状态，再收集最小必要证据。

## 使用原则

回答常见问题时，按这个顺序组织信息：

1. 先给最短可执行动作或命令。
2. 如果依赖版本、配置、模型、终端或 session 状态，再补最小证据清单。
3. 只有当问题像 bug、或仅凭当前现象无法复现时，再引导用户生成 `/feedback`。

常用证据：

- `traecli --version` / `traex --version` 或启动页里的版本信息。
- 用户运行的是 `traecli`、`traex`、`traecli exec` / `traex exec`，还是 ACP。
- 相关 TUI 信息：`/status`、`/model`、`/permissions`、`/ps`、
  `/plugins`、`/skills`、`/mcp`。
- 已脱敏的 `~/.trae/traecli.toml` 和 `<repo>/.trae/traecli.toml`。
- `$TRAE_HOME`、`$TRAECLI_HOME`、当前工作目录、终端类型、`/feedback`
  归档链接。

## 安装、更新，以及 `traecli` / `traex` 怎么选

通用结论：

- 日常使用优先推荐 `traecli`。
- 升级过渡期里，`traecli` 可能仍被旧版 Coco 占用；如果命令行为不符合预期，
  用 `traex` 这个不冲突的名字验证新版 TraeX 是否安装成功。
- 如果用户没有历史包袱，或当前机器上 `traecli` 和 Coco 仍在争夺别名，可以直接用
  `traex` 作为新版入口；它就是 TRAE CLI 2.0 的不冲突命令名。
- 先让用户确认 `traecli --version`；如果疑似旧版 Coco，再确认
  `traex --version`。
- `traecli --version` 输出里出现 `traex-cli ...`、`traex-cli-...`、
  `traecli ...` 或 `traecli-...` 时，按 TraeX / TRAE CLI 2.0 处理；输出里出现
  `coco` 时，按旧版 Coco 处理。
- 例如 `traex-cli 0.0.0+4977c5a0.dirty` 和 `traecli 0.200.12-alpha.2`
  都是 TRAE CLI 2.0。
- 如果当前版本支持更新命令，日常升级用 `traecli update --channel stable`；
  正在验证内测修复时可用 `traecli update --channel alpha`。
- 如果 `traecli` 被旧版 Coco 占用，把上面的命令改成
  `traex update --channel stable` 或 `traex update --channel alpha`。
- 用户问怎么切升级通道时，直接让用户用 `traecli update --channel alpha` 切到最新
  alpha，用 `traecli update --channel stable` 切回 stable。
- 自动更新会定期检查新版本，但通常要到下次启动才会实际切到新版本；如果用户刚收到
  更新提示，建议重启 TraeX 后再验证。
- 用户问 update 后新增了什么功能时，先让用户用 `traecli update check` 查看当前
  版本、最新版本和发布时间；正式更新说明会先在群里同步，后续也会放到正式位置。
  如果只是想确认当前命令能力，也可以看 `traecli --help` 或相关子命令的 `--help`。

开发机里新旧版本并存时：

- 先不要直接删除文件。让用户提供这三条输出：

```bash
traecli --version
traex --version
which -a traecli traex
```

- 如果 `traecli` 仍是旧版 Coco，而 `traex` 是新版 TraeX，日常先用 `traex`
  验证新版能力。
- 如果用户截图或报错来自旧版 Coco，先建议升级到新版 TraeX / `traecli` 后复测；
  只有新版仍复现时，才按 TraeX 产品问题继续排查。
- TUI 截图里出现 `formerly coco` 时，这是用户仍在旧版 Coco / 旧包上的强信号；
  不要先按新版 TraeX 产品问题处理，优先引导升级或切到新版 `traex` 验证。
- 临时让 `traecli` 命令走新版时，可以在用户自己的 `~/.local/bin` 里建立软链，
  但要先确认该目录在 `$PATH` 里排在旧版命令之前。

```bash
cd ~/.local/bin && ln -s traex traecli
```

- 如果 `~/.local/bin/traecli` 已存在，不要覆盖；先根据 `which -a` 判断旧命令来自
  哪种安装方式，再给对应卸载步骤。

如果用户问"Coco 怎么没了"：

- 通常是安装新版过程中连续确认 `Y`，导致旧 Coco 被删除。
- 如果用户要找回 Coco，可以按恢复文档重新安装：
  https://bytedance.larkoffice.com/wiki/Er28whaTUiRgMekHLvDcISWmnXc
- 如果用户问 Trae CLI 2.0 和 Coco 的区别，当前口径是两者技术实现不同，但 Trae CLI
  2.0 会尽可能向前兼容 Coco 能力；Coco 后续不再继续功能迭代，会自动升级到
  Trae CLI 2.0。
- 安装时选择卸载旧 Coco 只影响旧二进制/软链，不会删除 Coco 配置和历史记录；会话和配置
  迁移仍按迁移流程处理。需要回退时，可以重新安装 Coco。

如果用户问怎么卸载 Coco：

- 切到 Trae CLI Next 通常不需要先单独卸载 Coco，直接重新跑新版 TraeX / `traecli`
  安装脚本即可；安装过程中会有卸载旧版的选项。
- 如果用户明确要手动清理，先用 `which -a traecli traex` 判断旧命令来自哪种安装
  方式，再给对应删除步骤，不要直接删除不明来源的可执行文件。

当用户问 stable / alpha 怎么选：

- stable 更适合日常使用。
- alpha 会更早拿到修复，适合用户正在命中已知内测问题时临时切换。
- 不要凭记忆承诺“最新版本号”。需要判断版本新旧时，让用户提供
  `traecli --version` 或 `traex --version`，必要时再按当前发布渠道核对。

开发机或 CloudIDE 安装时：

- 如果 `http://go/traecli-install` 短链不可用，让用户改用完整安装脚本 URL。
- 完整安装脚本默认安装 stable；需要 alpha 时，在执行脚本前设置
  `TRAEX_INSTALL_CHANNEL=alpha`。
- 非交互安装可以同时设置 `TRAEX_INSTALL_ASSUME_YES=1`。
- fish shell 下如果安装脚本提示需要把二进制目录加入 PATH，可以用
  `fish_add_path $BIN`，不要直接照搬 bash / zsh 的 `export PATH=...` 写法。

```bash
curl -fsSL https://tosv-myabc.byted.org/obj/trae-common-2-asiasebd/traex/install/install_all_platforms.sh | sh
```

```bash
TRAEX_INSTALL_CHANNEL=alpha TRAEX_INSTALL_ASSUME_YES=1 \
  sh -c 'curl -fsSL https://tosv-myabc.byted.org/obj/trae-common-2-asiasebd/traex/install/install_all_platforms.sh | sh'
```

如果安装脚本下载失败：

- 报 `403` 时，先检查是否设置了不适合当前网络的代理；开发机代理可能会影响
  内部对象存储访问。
- 报 `curl: (6) Could not resolve host: go` 时，说明当前网络不识别内部短链，改用
  完整安装脚本 URL。
- 如果开发机代理导致内部对象存储连接失败，先在本次安装命令前清理代理环境变量：

```bash
env -u http_proxy -u https_proxy -u all_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY \
  sh -c 'curl -fsSL https://code.byted.org/api/tos-proxy/download/traex_install.sh | sh'
```

Windows：

- 优先建议 WSL 按 Mac/Linux 方式安装。
- 原生 Windows 版本使用 PowerShell 安装脚本；如果 stable manifest 暂无
  `windows-x86_64` artifact，让用户先升级到包含 Windows artifact 的版本或按当前公告
  切 alpha，不要继续说“完全不支持 Windows”。
- 如果被系统安全软件拦截，按安全软件/终端策略排查；不要建议绕过公司安全策略。
- 报 `Failed to connect ... port 3128` 时，基本可以先按代理问题处理，确认
  `http_proxy` / `https_proxy` / 终端代理配置。
- 开发机网络连接异常时，同步检查 `no_proxy` / `NO_PROXY` 是否按 Recommended
  Configuration 配好，避免内部域名或对象存储请求被错误代理。
- 报 `SSL_ERROR_SYSCALL` 且目标是 `tosv-myabc.byted.org` 时，可以让用户试一次
  `curl --ipv6` 强制走 IPv6。
- 如果用户所在开发机网络需要显式指定 IPv6，可以直接让安装脚本下载命令加
  `--ipv6`，再按 stable / alpha 需要补环境变量。

```bash
curl --ipv6 -fsSL https://tosv-myabc.byted.org/obj/trae-common-2-asiasebd/traex/install/install_all_platforms.sh | sh
```

- 如果仍失败，收集完整 `curl -v` 输出、机器环境、代理环境变量和网络位置，不要
  只看错误码猜根因。

Linux sandbox 依赖：

- 如果提示缺少 `bubblewrap`，先按发行版安装，例如 Ubuntu / Debian：

```bash
sudo apt install bubblewrap
```

- 如果安装后仍出现 sandbox 或路径异常，比如日志里还在找 Codex 目录，收集
  `traecli --version` / `traex --version`、`/status`、`/feedback` 和相关日志；
  不要只按依赖缺失处理。

版本和额度：

- alpha 改动频繁，可能每天自动更新多次；不要把高频更新解释成 AI 自己改代码。
- GPT 5.5 等模型额度通常和 Trae IDE 侧共享；具体限流和限额以账号和 provider
  当前策略为准，不要承诺固定数字。
- 额度和重置周期优先让用户看 `/model`；当前口径是 TraeX 与 Trae IDE 共享 quota，
  重置周期也跟 Trae IDE 对齐，通常按周重置。
- 当前不是所有模型都有 quota 限制；用户问具体剩余额度时，先让用户以 `/model`
  展示为准，当前口径是只有 o 系列等部分模型会显示或受 quota 限制。
- 用户问有没有类似旧版 `coco models` 的模型列表命令时，优先让用户在 TUI 里用
  `/model` 查看和切换；需要在命令行直接打印可用模型列表时，可以用
  `traex debug models`。
- GPT 5.5 当前不支持通过 reasoning shortcuts 调整推理强度；如果用户看到
  `Reasoning shortcuts are unavailable for GPT-5.5`，按能力边界解释为当前模型暂
  不支持，并建议在 `/model` 和 `/status` 里确认实际模型能力。
- 用户问 o 系列模型 reasoning 选择能力“什么时候支持”时，不要回答“当前已经支
  持”。当前口径是正在对接，具体可用时间以版本发布和团队通知为准。
- 不要把 GPT 5.5 reasoning 不可调解释成 fork Codex 后人为去掉能力；当前主要是
  资源支撑和分阶段开放问题。reasoning 会陆续开放，具体开放节奏以团队通知为准。
- 如果用户所在部门已有可用 ModelHub 资源，可以引导其按自定义模型方式接入；TraeX
  CLI 当前支持配置自定义模型，是否支持对应 reasoning 能力取决于该模型和 provider。
- 如果用户接入方舟自定义模型时遇到 429 限流，当前 TraeX CLI 没有内置 TPM
  限流配置项，也不能在 `traecli.toml` 里设置 TPM。优先让用户到方舟侧调整模型
  配额、限流或部署策略；临时规避可以降低请求 token 量、并发或调用频率。TraeX
  侧只负责按 Coco 兼容配置声明 `model`、`model_provider`、`[[models]]` 和
  `[models.<provider>]` 连接信息。
- 用户问默认思考深度时，当前口径是默认 `medium`；如果用户已显式配置模型或
  provider 能力不同，以当前 `/status`、模型配置和模型能力为准。
- 用户问 GPT 5.5 MAX 为什么 `/context` 里只看到约 200K 可用上下文时，优先按
  旧版本展示问题处理：这个问题已在 trae-x MR !1167 修复，新版本中 GPT-5.5
  MAX 的 `/context` 会按 1M 窗口显示。先引导用户升级到最新 stable 或 alpha
  后重启再看；如果升级后仍显示异常，再收集 `/context`、`/status`、版本信息和
  `/feedback`。
- 如果用户用 GPT-5.5 且开 Max，长上下文打到很高后报
  `stream disconnected before completion: Trae chat abnormal finish_reason:
  "max_output_tokens"`，先按已知产品问题处理。当前表现是会话可能直接异常结束，
  并且进入这个状态后手动 `/compact` 也可能失败。临时规避是不要等到接近 900K
  再压缩，在上下文明显变长时提前 `/compact`；如果已经进入报错状态，优先用
  `/new` 开新会话继续。如果只是回答被截断，可先在原会话发送“继续”；如果 TUI
  已退出或连接中断，可尝试 `/resume` 或 `traecli resume --last`。仍需保留上下文时，
  可临时切到 3o 或非 Max / 更稳定模型。跟进时收集 `/context`、`/status`、模型名、
  版本和 `/feedback`。
- 如果用户问 2.0 token 用量为什么没有同步到 tokscale，先说明这是当前统计链路
  的已知缺口，不要承诺已经可用。临时排查可让用户用 `/status`、`/context` 和
  `/cost` 看当前会话或局部用量；这些命令不能替代 tokscale 的累计统计。
- 如果用户问 `/clear` 退出页里的 `+ [NUM] cached`，说明它也是 token 数，表示
  当前连续会话中命中过缓存的输入 token；缓存部分不计入旁边的 `input`，所以
  `cached` 显著高于 `input` 是正常的。
- 如果用户问 statusline、`/status`、运行结束后的 `Token usage` 三种 input 口径
  不一致，以运行结束后的 `Token usage` 为准拆分本轮实际消耗：`input=` 是非缓存
  输入，`+ cached` 是缓存命中的输入；statusline 的 `in` 通常会把两者加起来展示，
  `/status` 的 total 更偏当前请求/上下文口径。
- `context window` 百分比不要和整个 session 累计 token 消耗直接相除；它看的是当前
  最后一层请求实际占用的上下文窗口，整个 session 消耗则会把多轮 AI 工具调用和回复
  逐层累计。cached 很高或工具调用很多时，`in`、`total` 和 context window 剩余比例
  不一一对应是正常的。
- 如果用户反馈长上下文会话里回答串回前文、答非所问或 tool call 开始不稳定，先让
  用户看 `/context` 或 `/status` 的上下文占用。当前模型在超大上下文下实际遵循能力会
  下降，尤其 o 系列上下文很大时更容易出错。临时规避是先执行 `/compact`，或用
  `/new` 开新会话；MAX/重推理模型不稳定时，可让用户切到标准版或其他当前更稳定的
  模型复测。仍稳定复现时收集 `/feedback`、模型名、版本和触发前后的日志。

联网搜索：

- TraeX CLI 和 Trae Desktop 背后的 websearch 能力当前口径一致。
- 当前更适合检索通用网页、官网文档、博客和可公开抓取的页面；对 X/Twitter 等
  社交媒体实时动态、官方账号最新帖子和需要登录态/反爬绕过的内容召回较弱。
- 用户反馈官网或 X/Twitter 搜不到时，先建议把目标官网、博客、文档页或新闻页
  URL 写进 prompt，并说明 X/Twitter 动态检索当前不稳定；如果业务上依赖该能力，
  转人工评估数据源或召回策略优化。

自带方舟模型 thinking / reasoning 配置：

- 不要让用户单独配置 `thinking_mode`；当前统一使用 reasoning 相关配置项。
- 常用配置写在 `~/.trae/traecli.toml`：

```toml
model_reasoning_effort = "high"
model_reasoning_summary = "detailed"
```

- 如果用户希望界面尽量展示推理内容，可再加：

```toml
hide_agent_reasoning = false
show_raw_agent_reasoning = true
```

- 是否能看到详细 thinking 仍取决于当前方舟模型和 provider 是否返回相关内容。
  配置后让用户重启 TraeX，并用 `/status` 或 `/model` 确认当前模型配置是否生效。

## 平台支持

通用结论：

- 当前优先支持 macOS / Linux；Windows 建议优先 WSL，也支持原生 PowerShell 安装链路。
- Windows 原生安装用手册里的 `traex_install_windows.ps1`。如果用户看到
  `stable.json did not include an artifact for windows-x86_64`，先让用户升级到包含
  Windows artifact 的渠道/版本，或按当前公告临时切 alpha；不要再回答“native 完全不支持”。
- Windows 上初次启动提示 sandbox 时，优先按手册选择非管理员 sandbox 方案；如被系统安全
  软件拦截，按公司终端安全策略处理。
- 如果用户要立即获得最稳定体验，仍优先建议 WSL、远程 Linux 开发机或 CloudIDE，并说明
  这和原生 Windows TUI 体验不同。

Merlin 或其他远程开发机能不能跑：

- 只要机器网络能访问 TraeX 依赖的后端服务，并且具备可用鉴权，就可以运行。
- i18n devbox 没有默认禁止 TraeX；如果无法安装、登录或请求模型，先按网络、
  代理或证书链路排查，不要直接归因为 devbox 类型不支持。
- GPU worker 上运行 TraeX 不需要额外的 TraeX GPU 开关；是否能使用 GPU 取决于当前
  机器环境、驱动、容器和用户命令本身。
- TraeX 默认不是 Full Access / 无沙箱模式；如需切换权限或确认当前模式，用
  `/permissions` 或 `/status` 查看和调整。
- 鉴权可以来自 Git、浏览器 SSO 或当前环境支持的登录方式；如果浏览器不在同一台
  机器上，按远程登录流程把完整 redirect URL 复制回终端。
- 先用网络诊断命令确认连通性：

```bash
traex doctor network
```

- 如果 `traecli` 被旧版占用，把命令改成 `traecli doctor network` 前，先确认
  `traecli --version` 确实是新版 TraeX；否则优先用 `traex` 验证。
- 如果用户贴出 `403`、`port 3128`、`SSL_ERROR_SYSCALL` 或连接超时，继续收集
  `env | grep -i proxy`、完整报错和 `traex doctor network` 输出，再判断是代理、
  网络出口、证书还是后端服务问题。
- 启动阶段如果提示 `copilot-cn.bytedance.net` 或 `ide.bytedance.net` request timed
  out，通常先按开发机网络出口或内网服务连通性排查，不要直接判断为产品拦截；可以
  先按提示继续进入 TraeX，再用 `traex doctor network` 和代理环境变量确认影响范围。

海外机器访问国内后端失败时：

- 先检查代理设置；如果代理异常，优先修代理，不要直接切后端。
- 如果代理没问题，按部分海外机器暂时无法访问国内后端处理。临时从对应区域启动：

```bash
TRAE_API_BASE_URL=https://copilot-sg.byteintl.net TRAE_SURFACE_FUNCTION=solo_agent traecli
```

```bash
TRAE_API_BASE_URL=https://copilot.byteintl.net TRAE_SURFACE_FUNCTION=solo_agent traecli
```

- 新加坡机器优先用 `copilot-sg.byteintl.net`，美东机器优先用
  `copilot.byteintl.net`。
- 提醒用户这是临时方案，模型列表可能没有国内环境完整，后续会提供更完善的解决方案。

## TraeX 支持 Remote-control 吗？

通用结论：

- 当前 TraeX 已有实验性的 `traecli remote-control` 入口，以及 app-server daemon 的
  remote-control 相关能力。先让用户确认 `traecli remote-control --help` 或
  `traex remote-control --help` 在当前版本是否存在。
- 这不是 Coco Web 同款网页运行时，也不等于“从 Web 侧 resume session 或继续执行”。
  如果用户问的是 Web GUI / 跨端接续，仍按 Coco Web / Argos 只读观测页的口径回答。
- remote-control 是实验能力；遇到连接、权限或 enrollment 问题时，先收集版本、
  启动命令、`app-server` / daemon 日志、`/feedback` 和具体客户端形态，再转 owner 评估。

## Skills 或规则目录放错了

通用结论：

- TraeX 用户级 skills / rules 通常放在 Trae home，也就是 `~/.trae` 下。
- 项目级资源可以放在项目 `.trae` 或 `.agents` 目录下。
- 项目级 skill 的常见路径是 `<repo>/.trae/skills/<name>/SKILL.md`。
- 当前 TraeX 支持扫描 `.agents` 和 `.trae` 项目资源目录。
- CLI 侧不区分 `.trae-cn` 和海外版目录；新配置和资源优先统一放在 `.trae`。
- 用 `/skills` 和 `/plugins` 确认当前运行中的 TUI 实际加载了什么。
- `/skills` 展示的是当前生效的 skill，同名 skill 会按名称去重，只保留优先级更高的
  定义；如果 `skills disable` 一类入口里仍看到多个同名项且无法区分来源，这是已知
  需要优化的体验问题，先让用户改 skill 名、停用当前生效项后重开会话，或带截图和
  resource_dirs 配置转 owner 评估。
- skill 扫描会递归识别带 `SKILL.md` 的子目录；如果某个子目录本身有
  `SKILL.md`，它会作为独立 skill 显示。只想保留主 skill 时，把不想单独暴露的
  子 skill 入口移走或去掉；普通参考资料目录不要放 `SKILL.md`。
- 如果用户说默认加载了很多 Byte / 飞书 skills，先让用户用 `/skills` 和
  `/plugins` 确认来源。TraeX 默认不内置这些 Byte skills；飞书、Codebase 等能力
  通常来自已安装插件或对应 CLI。需要减少加载项时，优先停用或卸载对应插件。

## 怎么禁用或重新启用某个 skill？

通用结论：

- 不要使用旧的 `[skills."<path>"] enabled = false` 写法；当前配置 schema 不按这个格式解析。
- 在 `~/.trae/traecli.toml` 里用 `[[skills.config]]` 数组项，selector 二选一：
  `path` 指向具体 `SKILL.md`，或 `name` 匹配 skill frontmatter 的 `name`。
- 重新启用时，可以删除对应 `[[skills.config]]` 条目，或用相同 selector 写
  `enabled = true` 的更高优先级配置覆盖。
- 如果用户只是想禁止模型自动发现，但仍允许手动 `/skill` / `$skill` 调用，使用
  skill frontmatter 的 `disable-model-invocation: true`，不要把它和全量禁用混为一谈。

```toml
[[skills.config]]
path = "/absolute/path/to/skills/my-skill/SKILL.md"
enabled = false

[[skills.config]]
name = "github:yeet"
enabled = false
```

禁用内置 bundled skills：

```toml
[skills.bundled]
enabled = false
```

## 全局 system 提示词怎么配置

通用结论：

- 对所有会话生效的全局指令，放在用户级配置 `~/.trae/traecli.toml` 的
  `instructions` 字段里。
- 如果用户明确想放全局 `AGENTS.md`，路径是 `~/.trae/AGENTS.md`；改完后可用
  `/status` 确认是否已加载。
- 只想对某个项目生效时，优先放在项目下的 `.trae/AGENTS.md`。
- 改完配置后重启 TraeX，再用 `/status` 确认当前加载的配置路径和会话信息。

示例：

```toml
instructions = "你的全局 system 提示词"
```

如果用户同时配置了用户级 `instructions` 和项目级 `AGENTS.md`，回答时说明二者作用
范围不同；需要判断最终生效内容时，收集 `/status`、当前工作目录和相关配置片段。

如果用户说 skill 不见了，优先检查：

- 当前 `$TRAE_HOME` 和 `$TRAECLI_HOME`。
- `traecli plugin list` 和 `traecli plugin validate <plugin>`；如果
  `traecli` 被旧版占用，则改用 `traex`。
- 插件缓存目录：`$TRAECLI_HOME/plugins/cache/...`。
- 如果资源来自项目目录，确认项目是否被信任。
- 新增或修改 skill 后，列表会自动热加载；但热加载结果不会自动进入当前会话的模型
  上下文，当前会话结束前只能手工通过 `/skills` 或 slash 调用。要让模型自动发现和
  调用新 skill，建议新开会话。

## Plugin 里的 command 是否支持

通用结论：

- 当前 TraeX 插件对外可用能力以 skills、hooks、MCP servers、apps、models 等为主。
- commands 已支持；如果用户当前版本不能用 commands，让用户先升级到
  `0.200.12-alpha.2` 后再验证。
- skill 可以被 `/` 呼出，也能被模型按描述自动发现。用户只想手动 `/name` 调用时，
  在 skill frontmatter 里设置 `disable-model-invocation: true`。
- 用 `/skills` 确认 skill 是否已经加载；用 `/plugins` 确认插件是否启用。
- 如果用户问类似 Pi Agent 的 Plugin / Extension 个性化定制，先说明 TraeX 当前
  已支持插件贡献 skills、hooks、MCP servers、apps、models 等能力；代码级
  extension 能力会有，但更适合需要深度定制的团队二次开发，不要承诺个人配置
  入口已经完整可用。

从旧目录迁移 command：

- 先执行 `traecli migrate`；如果之前跳过过迁移，再执行
  `traecli migrate --force`。
- 迁移范围包括旧 Coco / 兼容目录，不只是 `~/.coco`；`~/.trae-cn/commands`
  也在兼容迁移范围内。
- command 迁移是非破坏性的：原文件不会被修改。
- 迁移完成后建议统一在 `~/.trae` 下维护资源，不要继续把 `~/.trae-cn`
  当长期主目录。
- 升级到 `0.200.12-alpha.2` 后，进 TUI 直接验证对应 command 是否可用。

如果用户明确在等 command 兼容发版，让用户升级到 `0.200.12-alpha.2` 后验证。

如果升级后 commands 仍不可用，收集版本、command 路径、插件来源、`/plugins`、
`/skills` 和 `/feedback` 后转人工评估。

## TRAE IDE 里的 TRAE CLI 插件有什么用？

通用结论：

- 先区分用户问的是 TRAE IDE 里的 “TRAE CLI 插件”，还是 TraeX agent plugins。
  如果用户在 IDE 里看到插件入口，不要只泛泛解释 agent plugins。
- TRAE IDE 里的 TRAE CLI 插件主要用于把 IDE 中的文件和选中文本发送到 CLI，
  并在任务结束后输出本次变更 diff。
- 安装和使用入口参考产品文档：
  https://bytedance.larkoffice.com/wiki/HWUPwVssCi0KSPkOCZtcwznmnYg
- JetBrains / GoLand 插件如果 `Send To TraeCli` 只拉起旧 `traecli` 或 Coco，
  先让用户把插件里的 CLI 命令配置从 `traecli` 改为 `traex`，或升级到新版插件；
  配置入口可在插件设置里搜索 `Trae CLI` 或从插件安装页的设置按钮进入。
- VS Code / JetBrains 插件默认命令如果仍是 `traecli` 且用户机器上 `traecli` 指向旧
  Coco，直接把插件启动命令改成 `traex`。新版插件通常已默认改成 `traex`；如果用户
  看不到更新提示，让用户确认插件版本和插件市场来源。
- `/ide` 命令不是普通终端里的万能 IDE 上下文读取。它需要 VS Code / Cursor + TRAE
  IDE extension 等 IDE 侧连接；没有扩展连接时，报 `IDE context could not be enabled`
  属于当前能力边界，不是让用户再装 Lark/Codebase 插件能解决的问题。
- 如果用户手动关闭了 CLI 进程，但 IDE 终端仍在，插件的 send 判断仍会认为
  terminal 存在，不会触发重新创建；先让用户关闭对应终端后重试。后续可跟进对齐
  Codex / Claude 插件，在 CLI 已关闭时隐藏 send 菜单。
- 如果用户问的是 TraeX agent plugins，再按 `/plugins`、`/skills`、`/mcp`
  解释插件会贡献 skills、MCP servers、hooks、apps、models 等能力。

## 可以使用 Codex 官方 Marketplace 吗？

通用结论：

- Codex 官方 Marketplace 接入正在支持中；当前不要承诺可以直接使用。
- 不要引导用户运行 `traecli plugin marketplace add openai/plugins` 作为可用方案。
- 如果用户已经有具体插件需求，先收集插件名称、来源链接、当前 `/plugins`、
  `/skills` 和 `traecli plugin marketplace list` 输出，再转人工评估兼容路径。

## Coco marketplace 插件迁移到 TraeX 后安装失败怎么办？

通用结论：

- 旧 Coco 的 marketplace 命令不一定能直接照搬到 TraeX；不要承诺
  `coco plugin marketplace add --type=codebase ...` 在 TraeX 中已经可用。
- 如果报 `type=codebase` 相关错误、插件详情不可用，或 TUI 里显示
  `plugin/install failed in TUI`，先收集原 Coco 命令、插件名、来源仓库、当前
  `/plugins`、`traecli plugin marketplace list` 和 `traecli plugin list` 输出。
- 内置插件页安装失败时，同时收集 `traecli --version` / `traex --version`、
  `$TRAECLI_HOME`、`/feedback` 链接和插件名；不要只让用户反复重试安装。
- 如果用户只是想使用插件贡献的 skill、hook 或 MCP server，先确认是否已有对应
  TraeX 插件包或可用的 skill 迁移路径，再按具体插件转人工评估。

## TraeX 还有类似 Coco Web 的入口吗？

通用结论：

- 日常执行和继续任务优先引导用户使用 `traecli` / `traex` 的 CLI 或 TUI。
- 如果用户想看之前 Coco Web 里类似的 session 详情页，目前替代方案是 Argos 只读
  session / trace 观测页。TUI 中优先用 `/trace` 打开当前 thread；需要分享时用
  `/share`。通用入口是：
  https://argos.byted.org/argos/ai_apm/sessions?psm=trae.cli.monitor
- 这个 Web 侧页面基于观测数据构建，只读展示历史消息流、Context 和 tool call
  明细；目前不支持从 Web 侧 resume session 或继续执行。
- 相关需求反馈群：
  https://applink.larkoffice.com/client/chat/chatter/add_by_link?link_token=944l6371-4f36-43a2-991d-09a5ee6e42e1
- 如果用户已经删除旧版并依赖 Web 能力，先收集具体功能名和使用场景，再转人工评估
  迁移路径。
- 如果用户想找之前 Coco Web 里的某个具体能力，先询问功能名，再对应到现有
  CLI/TUI 或 Argos 观测入口；当前无法确认支持时，转人工评估。
- 如果用户问后续是否支持 GUI，当前口径是暂时没有进一步计划；等当前版本稳定后会
  再考虑。记录为 GUI 形态 feature 诉求，不要承诺具体时间。

## traecli review 使用哪个模型？

通用结论：

- 默认跟当前选中的模型走；只有单独配置了 `review_model`，`traecli review` 才会
  走专用 review 模型。
- 让用户先用 `/model` 查看当前选中模型，用 `/status` 确认 provider 和实际生效
  模型。
- 哪个模型 review 更快取决于当前可见模型列表、provider、首字延迟和整段输出耗时；
  不要在不知道用户模型列表时承诺固定最快模型。通常轻量、低延迟模型会比重推理
  模型更快，但质量也可能下降。
- 如果用户希望 review 和日常聊天使用不同模型，再引导配置 `review_model`。

## 自定义模型如何选择 codex / claude code 模式？

通用结论：

- 新增或排查自定义模型时，只推荐在 Coco 兼容的 `[[models]]` 配置里显式写
  `harness_mode`。
- `harness_mode = "codex"` 使用 Codex harness；`harness_mode = "claudecode"` 使用
  Claude Code harness；不确定时先用 `auto`，再按实际效果调整。
- 用户不显式配置时，默认会按模型自动选择：GPT 系列通常走 Codex harness，Seed
  模型走 Seed harness，其他模型通常走 Claude Code harness；这里切换的是内部
  prompt 和 tools 协议，不是调用不同的外部 CLI。
- 旧字段 `model_family`、`prompt_hint` 已废弃，不要推荐用户用它们选择模式。
- 如果旧配置里已经存在 `model_family` 或 `prompt_hint`，可以先保留用于兼容，但新文档、
  新示例和排障建议都应改为 `harness_mode`。
- 如果用户问“既然基于 Codex fork，为什么不用原版 Codex/aiden/ttadk”，先解释
  TraeX 不只是 fork 后换壳：除多套 harness 外，还补了 recap、`/btw`、更多 hooks、
  workspace rewind、偏 Claude Code 风格的精简输出等产品能力。

示例：

```toml
model = "my-model"
model_provider = "custom"

[[models]]
name = "my-model"
harness_mode = "codex"

[models.open_ai]
base_url = "https://api.example.com/v1"
api_key = "${MY_API_KEY}"
```

如果用户不确定当前实际走了哪种模式，先让用户提供 `/status`、`/model`、
`~/.trae/traecli.toml` 中对应模型配置和当前模型名。

## 引用项目文件时能指定行范围吗？

可以。让用户在文件路径后直接手写行号或行范围，大模型会按上下文理解。

示例：

```text
src/main.rs 120-180
src/main.rs:120
```

如果用户说模型没有读到对应位置，继续收集当前工作目录、文件相对路径、目标行号、
以及用户在输入框里写的完整引用方式。

## TraeX 支持自定义 tools 吗？

通用结论：

- 支持自定义 tools 的推荐路径是 MCP；在 `traecli.toml` 里配置
  `mcp_servers.<name>`，或安装会贡献 MCP server 的 plugin。
- TUI 里用 `/mcp` 查看和管理 MCP；CLI 侧可用 `traecli mcp list`。如果
  `traecli` 被旧版占用，则改用 `traex mcp list`。
- TraeX 插件本身也可以分发 MCP servers、skills、hooks、apps、models 等能力。
- 不要默认承诺存在一套独立于 MCP 的“内置 tool 配置”机制；如果用户明确要求
  非 MCP 形态的自定义 tool，再作为 feature 诉求转人工评估。
- 一次性临时注入 MCP server 时，用启动参数 `-c` 覆盖本次进程配置；当前没有单独
  的“一次性 mcp add”命令。`traecli mcp add ...` 是持久化写入配置。

示例：

```bash
traecli -c 'mcp_servers.tmp={ command = "uvx", args = ["your-mcp-server"] }'
traecli -c 'mcp_servers.tmp={ url = "https://your-mcp.example.com" }'
```

排查入口：

- 让用户贴 MCP 配置块、启动命令和 `/mcp` 输出。
- 如果启动时报 `invalid transport`，并且错误指向
  `mcp_servers.<server>.tools.<tool>` 这类配置路径，先让用户从实际生效的
  `~/.trae/traecli.toml` 或项目 `<repo>/.trae/traecli.toml` 中删除对应 MCP
  server 配置块后重启。当前 owner 口径是 MCP 配置异常不应该阻塞启动，已作为
  bug 跟进修复。
- 如果 tool 已经被 MCP server 暴露但模型看不到，继续检查当前模型 / harness
  是否支持对应工具协议。

## Chrome MCP 怎么配置？

通用结论：

- Chrome MCP 按普通 MCP server 配置，不需要单独的 TraeX 专用入口。
- 如果用户还没有具体启动命令，先让用户确认要使用的 Chrome MCP 包名或启动命令；
  不要替用户臆造包名。
- 配置后重启 TraeX，用 `/mcp` 或 `traecli mcp list` 确认；如果 `traecli`
  被旧版占用，则改用 `traex mcp list`。

配置形态：

```toml
[mcp_servers.chrome]
command = "npx"
args = ["-y", "<你的 Chrome MCP 包名或启动命令>"]
enabled = true
```

## 如何接入飞书 CLI？

通用结论：

- 新版 TraeX 不再默认自带飞书 MCP；改为通过内置插件帮助用户安装
  `lark-cli` 和配套 skills。
- 用户碰到需要飞书能力的任务时，AI 通常会为用户自动安装或引导安装。
- 手动安装有两种方式：
  - 内置插件：打开 `/plugins`，按右方向键切到 `[TRAEX BD Plugins]`，选择
    `Lark CLI`，回车进入安装。回复用户时不要只说“去 `/plugins` 安装”，必须把
    “按右方向键切到 `[TRAEX BD Plugins]`”这一步说出来，否则用户可能在默认列表里
    找不到。
  - 官方命令：`npm install -g @larksuite/cli`。
- 安装后让用户新开 TraeX 会话或重启 TUI，再用 `/skills` 确认是否加载了 lark
  相关 skills。
- 如果内置 `Lark CLI` 插件在 `/plugins` 里安装失败，且详情页显示
  `Plugin detail unavailable` 或 TUI 提示 `plugin/install failed`，先按本地环境
  问题排查，不要直接定性为已知插件安装问题。让用户把 `plugin/install failed`、
  插件详情错误和当前环境交给 TraeX 继续排查失败原因，并收集 `/feedback`。临时规避
  仍可以直接执行 `npm install -g @larksuite/cli`，再重启 TraeX；需要飞书能力时还要
  执行 `lark-cli auth login`。

官方命令安装后，先登录：

```bash
lark-cli auth login
```

能力介绍与最佳实践：
https://bytedance.larkoffice.com/wiki/ILuTww7Xcimb6GkhH0mcK2f4nS7

如果只需要某一类能力，可以按 `lark-cli --help` 选择对应能力。遇到权限报错时，
按报错提示补 OAuth scope 后重新登录。

如果使用飞书 CLI 读文档时反复要求扫码或授权：

- 先区分 TraeX 主登录态和飞书 CLI 的资源域授权。读文档通常需要单独完成 docs 域
  授权，可以让用户执行：

```bash
lark-cli auth login --domain docs
```

- 如果授权完成后仍然每次都弹，优先确认当前 TraeX 会话是否运行在 sandbox 中。沙箱
  环境可能拿不到上一次的授权缓存，需要新开 TraeX 会话后复测。
- 继续复现时，收集 `lark-cli auth status`、`traecli --version`、`/status` 和
  `/permissions`，再判断是授权缓存、sandbox 还是版本问题。

## traecli 怎么访问 Codebase？

通用结论：

- 新版 TraeX 不再默认自带 Codebase MCP；改为通过内置插件帮助用户安装
  `codebase` CLI 和配套 skill。
- 用户碰到需要 Codebase 的任务时，AI 通常会为用户自动安装或引导安装。
- 手动安装有两种方式：
  - 内置插件：打开 `/plugins`，按右方向键切到 `[TRAEX BD Plugins]`，选择
    `Codebase CLI`，回车进入安装。回复用户时不要只说“去 `/plugins` 安装”，必须把
    “按右方向键切到 `[TRAEX BD Plugins]`”这一步说出来，否则用户可能在默认列表里
    找不到。
  - 官方命令：
    `npm install -g @vecode-fe/codebase-cli@latest --registry=http://bnpm.byted.org`。
- 安装好 `codebase` CLI 后，TraeX 可以在 shell 中调用它，也可以通过 Codebase
  Skill 读 MR、issue、diff、checks 等信息。

Codebase CLI / Codebase Skill 使用指南：
  https://bytedance.larkoffice.com/wiki/RaRiw9Jjciazo1kgssicRxx1nWb

安装后先确认：

```bash
codebase --version
codebase auth status
```

如果用户已安装但 TraeX 调不到，继续检查 `which codebase`、`PATH`、当前 shell 环境
和是否完成 `codebase auth login`。

## Claude Code 插件和 CodeGraph 怎么接入

通用结论：

- 普通 Claude Code 插件可以先按 TraeX plugin 方式尝试安装，例如
  `traex plugin install frontend-design@claude-plugins-official`。
- Claude Code LSP 插件比较特殊，不要当成普通插件承诺兼容；它的主要逻辑在
  Claude Code 源码里，TraeX 侧需要单独对齐能力。
- CodeGraph 走 MCP 接入，不是 TraeX plugin；如果它的 installer 只识别 Codex CLI
  配置，TraeX 里可以手写 MCP server 配置。

CodeGraph 示例：

```toml
[mcp_servers.codegraph]
command = "codegraph"
args = ["serve", "--mcp"]
enabled = true
startup_timeout_sec = 30.0
tool_timeout_sec = 60.0
```

配置后重启 TraeX，用 `/mcp` 或 `traecli mcp list` 确认；如果 `traecli` 被旧版
占用，则改用 `traex mcp list`。

## Coco 里的 Codebase / Context4Code MCP 还在吗？

当前口径：

- 不要继续按“Coco 自带 MCP”来承诺；新版 TraeX 不再默认自带 Codebase / Lark
  MCP，改为通过内置插件帮助安装对应 CLI / skill。
- Codebase / Lark 这类能力，优先让用户直接对 AI 说明诉求，由 AI 自动安装或调用
  对应 CLI / skill；需要手动安装时，按上面的内置插件或官方命令路径处理。
- Context4Code MCP 仍可按文档安装和使用；如果用户说新版里看不到，先让用户贴
  `/mcp` 或 `traecli mcp list` 输出，再区分是未安装、未启用还是登录态问题。
- 如果 `traecli` 被旧版占用，则改用 `traex mcp list`。

不要混淆：

- “能力仍可接入”不等于“新版默认内置并自动启用”。
- “通过 MCP 使用”不等于“插件 command 机制仍推荐使用”。

## Hooks 和 AI 代码贡献上报

通用结论：

- TraeX 的 hooks 目标是兼容 Coco / Claude 风格 hook，但具体能力要以当前版本
  和 `/hooks` 输出为准。
- 如果 `/hooks` 看不到插件 hook，先确认插件 hook 功能是否开启：

```toml
[features]
plugin_hooks = true
```

- 修改配置后重启 TraeX，再用 `/hooks`、`/plugins` 和 `/status` 确认是否生效。
- 如果每次使用都出现 hook gate 或插件信任确认，先让用户确认是否有长期 trust
  选项；没有的话收集版本、`/hooks`、`/plugins` 和 `/feedback`。

AI 代码贡献统计不上报时：

- 先核对正在运行的 ai-contribution 插件安装路径和 manifest 版本：0.2.2 是清理专用版，
  不会上报；0.3.0 恢复上报与有界缓存。未知版本以安装内容为准，不能拿仓库源码代替。
- 如果已加载 check-hook-reporting skill，按该 skill 的只读流程检查具体 session/turn；
  它附带 scripts/inspect-reporting.cjs，可汇总当前和上一份日志、去重重试、检查缓存元数据。
- 确认插件启用、plugin_hooks 生效，/hooks 存在 UserPromptSubmit、PreToolUse、
  PostToolUse、PostToolUseFailure、Stop。避免市场插件、本地副本和手工 hook 重复启用。
- 0.3.0 按工具前后快照捕获实际新增代码；核对同一 turn/tool 的 Pre/Post，缺 Pre 不补报。
  确认操作位于真实 Git 仓库，纯聊天、只读、纯删除、非 Git、被过滤文件无新增事件可属正常。
  不再按旧 turn_git_diff 或任意 git diff 判断本轮是否上报。
- 分清采集诊断、queued、生产投递和看板：只有 delivery 同时满足 transport=mcs_production、
  status=accepted、httpStatus=200、responseCode=0 才证明生产接收；loopback、dry-run、
  旧 ok 不算。delivery_unknown 不自动重放；日志轮转后的缺失证据无法证明没有上报。
- 默认数据目录是 OS home 下 .trae/hooks/ai-contribution-v2，独立于 TRAE_HOME / TRAECLI_HOME；
  AI_CONTRIBUTION_LOG_DIR 可覆盖。检查暂停、队列、可信容量账本和最近 GC，不能为排查直接删缓存。
- reset 时结合 DNS、路由和目标域名代理命中日志；Mihomo/TUN 的 REJECT 不受 NO_PROXY 保证绕过。
  不自动改全局代理、不固化 CDN IP、不关闭 TLS。生产 accepted 仍需单独核对看板最终归因。
- 只提供相关版本、IDs、时间窗口和去敏日志，不输出完整认证/config/env 或代码快照正文。
- 如果用户想在 skill 触发时上报埋点或感知 agent 执行 skill，这是独立的 skill hook / skill
  事件诉求，当前还没有通用 skill hook，不能当作 AI 代码贡献上报能力。

SessionStart hook 想动态设置项目环境变量时：

- `SessionStart` 更适合给模型补充启动上下文，不是修改 TraeX 主进程或后续工具
  进程环境变量的机制。
- hook 的 stdout 可以作为 additional context 注入会话；普通文本和 Claude 风格
  JSON 都可以用于告诉模型当前项目需要什么环境。
- hook 子进程里的 `export FOO=bar` 只影响 hook 自己，退出后不会反向写回
  TraeX。
- 如果诉求是“后续所有 shell 命令真实带上环境变量”，应在启动 TraeX 前设置
  环境变量，或让 hook 生成 env 文件，并在 additional context 里要求后续命令
  `source` 这个文件。
- 如果用户用 `gvm` / `nvm` / `pyenv` / `conda` 等切换工具版本，但 TraeX 内看到的
  仍是旧版本，先确认是在同一个终端里完成切换、`go version` / `node --version`
  等已经正确，再从这个终端启动 TraeX。桌面图标、IDE 按钮或另一个终端拉起的
  TraeX 可能继承的是旧 shell 环境。

Claude 风格 JSON 示例：

```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "当前项目需要使用 FOO=bar；后续执行命令前请带上或 source 对应 env 文件。"
  }
}
```

hook 配置结构报错时：

- hook 必须写成事件表下的 `hooks` 数组，不要写成 `[[hooks.state]]` 这类结构。
- 如果报错类似 `invalid type: sequence, expected a map`，并且位置指向
  `[[hooks.state]]`，优先按 Flux 注入 hooks 冲突处理；Flux 最新版 Island
  v0.1.15 已修复，让用户先升级 Flux。
- 示例：

```toml
[SessionStart]
hooks = [{ type = "command", command = "your-command", timeout = 30 }]
```

- 如果用户手动修好后又被改回去，先确认实际生效的是 `~/.trae/traecli.toml`，
  不是旧 `config.toml` 或其他配置源。
- 如果启动时报 TOML 解析错误，位置指向 hook 的 `command`，先检查是否把命令写成
  了双层引号，例如 `command = ""sh ...""`。路径里有空格也只需要合法 TOML 字符串：

```toml
command = "sh /Users/bytedance/Library/Application Support/VibeBuddy/coco-hook.sh"
```

- 如果用户说该 hook 是自动迁移过来的，记录迁移来源和原始配置；用户先按合法 TOML
  写法恢复启动，是否需要迁移修复再按复现情况转人工评估。

## 出现 ChatGPT 登录提示，或用户问是否需要 ChatGPT 账号

通用结论：

- 正常使用 Trae 后端时，用户不应该需要 ChatGPT 账号。
- 如果 TraeX 提示 ChatGPT 登录，先检查 `~/.trae/traecli.toml` 或 legacy
  `~/.trae/config.toml` 里是否设置了 `model_provider = "openai"`。
- 使用 Trae 后端时，应移除这个 override，或在当前版本需要时改成 `trae`。

常用清理命令：

```bash
for f in ~/.trae/config.toml ~/.trae/traecli.toml; do
    [ -f "$f" ] || continue
    sed -i.bak -E 's/^([[:space:]]*model_provider[[:space:]]*=[[:space:]]*)"openai"/\1"trae"/' "$f"
done
```

清理后让用户重启 TraeX，并用 `/status` 确认当前模型和 provider。

不要第一步就让用户删除整个配置文件。保留 `.bak`，等用户确认登录和模型选择
恢复正常后再处理备份。

## 远程机器或容器里的登录

通用结论：

- 先尝试普通 `traecli login`；如果 `traecli` 被旧版占用，则改用
  `traex login`。
- 如果浏览器开在另一台机器上，按 Trae SSO 流程把完整 redirect URL 复制回
  终端输入。
- 对 ChatGPT/OpenAI provider 的远程或无头环境登录，部分版本可能支持
  `traecli login --device-auth`；以用户本机 `traecli login --help` 或
  `traex login --help` 为准。

容器里没有 git/codebase auth 时：

- 先确认用户缺的是 Trae / ByteDance SSO，还是 git/codebase 登录态。用户问
  devbox、容器、远程机器里“长期后台运行怎么登录 / 怎么避免认证过期”时，默认优先
  按 git/codebase auth 处理，而不是引导到独立 provider。
- 如果问题是长期跑 agent 期间要持续读写代码仓库，优先让用户完成
  `git` / `codebase` 登录，例如检查 `codebase auth status` 并按需执行
  `codebase auth login`；具体命令以用户所在环境和代码平台要求为准。
- 登录失败时收集 `traecli login --help` 或 `traex login --help`、
  `$TRAE_HOME`、`$TRAECLI_HOME`，以及 CLI log 目录下的登录日志。
- 如果 `traecli login --sso` 已进入企业 SSO 页面但提示“账号不存在”，先确认用户安装
  的是否是 ToB 版本 traecli；内部用户应按群公告文档安装内部版后再登录，不要先判断为
  命令参数问题。

如果报 `keyring is not supported on this system`：

- 先按“用户实际运行的 `traecli` 仍指向旧版 Coco”处理，不要先判断为 TraeX
  登录问题。
- 让用户分别执行 `traecli --version` 和 `traex --version`。如果 `traecli`
  还是旧版 Coco，而 `traex` 是新版 TraeX，让用户改用 `traex login --sso`
  登录并启动。
- 如果 `traex login --sso` 正常，说明问题在旧版 Coco 的命令覆盖 / 自动更新
  路径，不需要修改 TraeX 登录配置。
- 只有确认用户已经在运行新版 TraeX，且仍然报 keyring 不支持时，再临时把凭据
  存储切到 file：

```bash
traex -c cli_auth_credentials_store=file login --sso
```

- 用 file 存储后，提醒用户不要把 `$TRAE_HOME`、`$TRAECLI_HOME` 或相关 token
  文件打包外发。

如果用户在 TUI 里运行 `/login` 卡住：

- 先确认版本；旧版可能存在登录流程卡住或命令名被旧 Coco 覆盖的问题。
- 优先让用户退出 TUI，在 shell 里运行 `traecli login --sso` 或上面的 file
  store 命令。
- 登录成功后重启 TUI，并用 `/status` 确认 provider 和登录状态。

## SSO 登录态过期怎么办？

通用结论：

- 当前不要承诺个人 SSO 有固定对外过期时长；活跃状态可能续期，实际以本机
  `~/.trae/cli/auth.json` 里的过期时间和当前登录状态为准。
- 如果报错明确是 session expired 或登录态过期，先执行
  `traecli auth login --sso`，完成登录后退出当前 TraeX 并重新进入；新版已修复
  部分登录态刷新问题。

## 长任务中断后怎么恢复？

通用结论：

- 长任务中途提示登录态过期时，先重新登录，再用 `traecli resume --last` 或
  `traex resume --last` 恢复最近会话。
- 普通 devbox 长期后台跑代码任务时，优先确认 git/codebase 登录态；如果任务需要
  持续读写代码仓库，检查 `codebase auth status` 并按需执行 `codebase auth login`。

## 系统对接或多人共用 runtime 怎么登录？

通用结论：

- 只有明确是系统对接、服务化后台 agent loop 或多人共用同一套 TraeX runtime 时，才
  不要依赖某个用户的个人 SSO；这类场景可考虑独立 provider / API key。
- 如果必须按用户隔离 TraeX runtime 和 `auth.json`，可以用不同
  `$TRAECLI_HOME` 启动，例如 `TRAECLI_HOME=~/trae-user-a traecli`。

## 非交互 exec 能接续已有 session 吗？

可以。`traecli exec` 下有 `resume` 子命令，用于在非交互场景接续已有 session：

```bash
traecli exec resume <SESSION_ID> "继续处理这个任务"
traecli exec resume --last "继续最近一次会话"
```

补充口径：

- 这不是 `traecli exec -resume` 参数；要使用子命令 `traecli exec resume ...`。
- 如果自动化脚本需要拿到 session id，让上一次 `traecli exec` 带 `--json` 输出，
  session id 会出现在 JSONL 事件里。
- 如果用户只是想进入交互式继续会话，使用普通 `traecli resume <SESSION_ID>` 或
  `traecli resume --last`。
- 如果用户问跨机器、跨 Desktop/CLI 继续同一会话，仍按“CLI 和 Desktop 可以共享同
  一个 session 吗？”中的当前限制回答。

## `traecli exec --json` 和 session JSONL 一样吗？

不一样。`--json` 是面向自动化调用方的 stdout JSONL 事件流，不是本地 session 文件的
完整镜像。

- 不要承诺 `--json` 会包含 session 目录 JSONL 里的所有内部事件。
- 如果用户发现 subagent 输出、内部工具细节或部分中间结果没有出现在 stdout JSONL，
  先按当前事件流能力边界解释，再收集版本、完整命令、stdout JSONL、对应 session id
  和本地 session 文件路径。
- 自动化只需要最终答复时，优先用 `-o <file>` / `--output-last-message <file>`。

## 重新登录或升级后 session 记录不见了

通用结论：

- TraeX 曾把 CLI runtime 文件迁到 `~/.trae/cli/` 下；主配置仍保留在
  `~/.trae/traecli.toml`。
- 先同时检查新旧目录，不要直接判断 session 丢失。
- 如果是 Coco session 迁移不生效，这是已知问题，修复版本是 `0.200.12-alpha.2`；
  让用户升级 alpha 版本后重启再验证。

常见路径：

- 旧 runtime 示例：`~/.trae/sessions/`，以及直接放在 `~/.trae/` 下的
  sqlite / db 文件。
- 新 runtime 示例：`~/.trae/cli/sessions/`、`~/.trae/cli/` 下的 sqlite /
  db、history、logs、models cache。

如果用户要找回历史：

- 先让用户保留新旧两个目录。
- 对比旧路径和新路径，把缺失的 runtime 文件在备份后复制到 `~/.trae/cli/`。
- 不要建议用户删除整个 `~/.trae`。

如果用户要查看某个 session 的 trace：

- 先到 `~/.trae/cli/sessions/` 按日期和 session id 找对应记录。
- 如果该 session 有运行 trace bundle，通常在对应目录下能看到 `trace.jsonl`；
  有些场景还会有 `payloads/` 目录。
- 如果只是排查当前会话，更直接的是先看 `~/.trae/cli/log/traecli-tui.log`。

## 支持导入 Codex 的 session 吗？

不支持。当前没有面向用户的“导入 Codex session 后继续对话”入口。

## CLI 和 Desktop 可以共享同一个 session 吗？

当前口径：

- 当前 TraeX CLI 和 Trae Desktop 还没有面向用户的同 session 共享/接续入口。
- CLI 侧支持自己的 `resume` / `fork` 会话恢复；Desktop 侧不能直接接管 CLI 的
  同一条对话上下文。
- 不同机器之间当前也不能像旧 Coco 云端存储那样直接恢复同一段 CLI 会话上下文。
  只能在产生该会话的本机用 `traecli resume` 或 `traecli resume --last` 恢复。
- 如果用户想让 CLI 后台改代码，再到图形界面 review，当前建议两边打开同一个
  workspace，基于文件 diff / git 状态审核结果，而不是接管同一 session。
- Web 侧已有基于 Argos 观测数据的只读 session 详情页，可以查看历史消息流、Context
  和 tool call 明细；它不是可接续执行的 runtime 页面。
- 远程 `/resume` / 跨设备 session 接续当前仍不支持，后续是否支持需要继续评估；对外
  不要承诺具体发布时间。
- 如果用户诉求是“不同工具背后接同一个 session，在 Desktop 里继续 CLI 的上下文”，
  这是跨端 session 接续 feature 诉求，应转人工评估。

记录时需要区分：

- “看 CLI 改出的文件结果”属于工作区协同，当前可行。
- “继续同一会话上下文追问/审核”属于跨端 session 共享，当前不支持。

## 配置文件位置和优先级

通用结论：

- 用户级配置：`~/.trae/traecli.toml`。
- 项目级配置：`<repo>/.trae/traecli.toml`。
- legacy `config.toml` 可能仍会作为 fallback 被读取，但新版本 TraeX 写入
  `traecli.toml`。
- runtime 数据默认在 `~/.trae/cli/`，除非 `$TRAECLI_HOME` 覆盖。

从 Codex 配置迁移时：

- 不要建议用户直接把 `.codex` 目录改名成 `.trae` 后当作 TraeX 配置使用。
- TraeX 和 Codex 的部分配置字段保持兼容，但不是“整个目录结构完全兼容”。
- 优先让用户把需要的字段迁移到 `~/.trae/traecli.toml` 或项目
  `<repo>/.trae/traecli.toml`，再用 `/status` 和 `/debug-config` 确认实际生效。
- 如果用户想继续复用 `.coco` / `.codex` 等目录里的 skills、agents、hooks、MCP
  等资源，优先建议执行 `traecli migrate`，把旧资源迁移到 `.trae` 目录。
- 如果用户明确要继续读取 workspace 里的 `.coco/skills`，需要在 TraeX 配置里设置
  `resource_dirs = [".trae", ".agents", ".coco"]`；默认读不到时不要直接判断为 bug。
- 工作空间级 skill 需要放在 `<repo>/.coco/skills/<name>/SKILL.md` 这类目录结构下。
  如果 `/skills` 看不到，先检查 `resource_dirs` 是否包含 `.coco`、当前项目是否受信任、
  以及 skill 文件名和 frontmatter 是否有效。
- 不要把整个 `.coco` 或 `.codex` 目录改名覆盖成 `.trae`。
- 如果用户只是想迁移 MCP 配置，可以把 Codex 里的 MCP 配置路径或片段交给
  TraeX 生成对应的 `[mcp_servers.*]` 配置，不要直接覆盖整个 TraeX home。

配置不生效时检查：

- `/status` 和 `/debug-config`。
- 命令行 `-c key=value` override。
- 项目配置是否因为项目未信任而没有生效。
- 用户是否改了 `config.toml`，但实际被 `traecli.toml` 覆盖。

## 自定义 agent 提示 duplicate agent role 怎么办？

通用结论：

- 同一个自定义 agent role 只保留一份入口定义，不要在 `agents/` 里同时放同名
  `.md` 和 `.toml`。
- 让用户删掉或重命名其中一份重复定义，重启 TraeX 后用 `/agents` 确认不再出现
  duplicate agent role 提示。
- 如果用户想给 agent 配独立参数，优先用单个 role 入口引用对应配置，不要额外放
  一个同名入口文件。

## memories 目录在哪里？

通用结论：

- 当前实际生效的 memories 目录是 `~/.trae/cli/memories`。
- 如果用户设置了 `$TRAECLI_HOME`，则实际目录是 `$TRAECLI_HOME/memories`。
- TUI 里 `/memory` 如果提示 `~/.trae/memories`，这是旧提示，按实际落盘目录
  `~/.trae/cli/memories` 为准。
- 如果用户要清空跨会话 memory，优先让用户在 TUI 里运行 `/memories`，选择
  `Reset all memories`。
- memories 是普通 Markdown 文件；用户明确要清理或压缩时，可以在
  `~/.trae/cli/memories` 下手工编辑，或让 AI 帮忙整理这些 Markdown。
- 如果用户想和 Codex 的 `.codex/memories` 复用，建议优先复制内容；直接 alias
  或软链可能因为两边并发写入带来未知问题。

## 关闭了 memory 为什么还是注入？

通用结论：

- 先看用户写的是哪个配置项。当前 TraeX 的 memory 读取/注入开关是
  `[memories] use_memories = false`，写入/生成开关是
  `[memories] generate_memories = false`。
- 不要建议用户用 `[memories] enabled = false` 关闭 memory；这个字段不是当前
  `[memories]` 配置的有效读取/注入开关。只写这个字段时，下一次会话仍可能注入
  `## Memory`。
- 如果要同时关闭读取和生成，建议配置：

```toml
[memories]
use_memories = false
generate_memories = false
```

- 也可以关闭整个 memory feature：

```toml
[features]
memories = false
```

- 如果用户反馈“关了还是加载”，先收集 `/status`、`/debug-config`、实际
  `traecli.toml`、启动时的 `TRAE_HOME` / `TRAECLI_HOME`，以及 prompt/debug 输出或
  feedback 包，再判断是不是配置项写错、配置层级未生效、或旧 session 已经带着旧
  prompt 启动。

## 模型列表、测试模型和模型权限

通用结论：

- 用 `/model` 切换模型，用 `/status` 确认当前生效模型。
- 如果当前选中的是测试模型或缓存模型，但 `/model` 里已经看不到，切换到
  列表里存在的模型。
- 如果模型列表异常少，先确认用户运行的是新版 TraeX；如果 `traecli` 疑似旧版
  Coco，用 `traex` 验证安装和版本，再按日常使用选 stable、验证内测修复选
  alpha 的规则升级并重启。
- 如果用户升级后发现 o1 / o2 / o3 等模型在 `/model` 中看不到，先确认是否是
  quota 已用尽；当前无 quota 时模型可能会被隐藏。可以让用户在 `/model` 里搜索
  `openrouter` 对照确认，后续交互会优化为更明确地展示无 quota 状态。
- 如果非交互式输出里出现 `model rerouted: <源模型> -> <目标模型>`，先把它解释为
  路由/提示信息，不等同于本轮执行失败。若源模型和目标模型底层实际为同一模型，
  以最终回答和 `turn.completed` 为准；如果用户要验证是否严格直连命中指定模型，
  这类输出不能作为直连命中的证据。遇到普通问题也标成 `HighRiskCyberActivity`
  这类明显不合理原因时，收集完整 JSONL 输出、模型名和 `/feedback`，交给模型
  provider 负责人排查提示或路由策略。

当用户问“这个模型怎么申请”：

- 不要猜模型准入策略。先要精确模型 id、`/model` 列表、当前版本和
  `/status` 里的 provider。
- 如果模型不在列表中，让用户先切到已列出的模型；是否开通要带版本和账号信息
  找模型或 provider 负责人确认。

当用户问“模型排队时能不能自动降级 / fallback”：

- 当前正式版可以配置排队 fallback，但仍建议提醒用户这条链路需要结合具体模型
  验证效果。
- 顶层配置里加排队等待时间，例如：

```toml
model_queue_fallback_after_secs = 10
```

- 再配置一个或多个 fallback 模型：

```toml
[[model_queue_fallbacks]]
model = "GPT-5.4"
```

- 如果 fallback 到用户自己的 OpenAI-compatible provider，先确认用户已经按该
  provider 登录或配置过，再写 provider：

```toml
[[model_queue_fallbacks]]
model = "gpt-5.5"
provider = "openai"
```

- 用户不想自动切换时，也可以单次启动带
  `-c model_provider=openai` 或 `-c model_provider=trae` 手动切。

遇到类似 `stream disconnected before completion: all models failed` 的后端错误：

- 收集版本、模型、provider 和 `/feedback`。
- 让用户确认切换模型后是否仍复现。
- 如果怀疑代理或网络链路问题，让用户先执行 `traex doctor network` 并贴出结果。
- 这类顶层错误只能说明模型路由或后端调用失败，不能直接当作最终根因。

## 命令报 output file exceeded 5GB limit 怎么办？

通用结论：

- `[TRAE] Command killed: output file exceeded 5GB limit` 是 TraeX 对 bash 命令输出的
  保护机制，避免单次命令输出异常膨胀占满磁盘。
- 这个限制当前不是用户侧可动态调整的配置项；不要引导用户找开关或改配置放大限制。
- 先让用户检查触发命令是否本来就会产生超大输出，改成过滤、分页、采样，或让命令把
  结果写到业务文件后再分段查看。
- 如果只是偶发且无法复现，可先按异常命令输出处理；如果稳定复现或正常命令也触发，
  收集触发命令、运行目录、TraeX 版本和 `/feedback`。

## Docker 或 SSH 里输入框出现白线 / 字符残留

通用结论：

- 先让用户执行 `/feedback`，否则很难确认终端、颜色和环境变量。
- 收集 TraeX 版本、宿主终端（如 iTerm2、Ghostty、VS Code terminal）、是否 SSH、
  是否在 Docker / CloudIDE、容器内 `echo $TERM`。
- 如果是输入框边缘出现两条白线，可能是终端背景探测异常，可以先在
  `~/.trae/traecli.toml` 里规避：

```toml
[tui]
composer_edge_style = "line"
```

- 如果是字符残留，先建议升级到最新 alpha 或 stable；已知修复可能先进入 alpha。

## 执行命令时出现 stty: standard input: Inappropriate ioctl for device

通用结论：

- 这通常不是业务命令本身的错误，而是 shell 启动脚本在非 TTY 场景里执行了
  `stty`，例如 `~/.zshrc` 里直接写了 `stty -ixon`。
- 先让用户检查 shell 启动文件：

```bash
printf 'stdin_is_tty=%s shell=%s\n' "$([ -t 0 ] && echo yes || echo no)" "$SHELL"
for f in ~/.zshenv ~/.zprofile ~/.zshrc ~/.bash_profile ~/.bashrc ~/.profile; do
  [ -f "$f" ] && grep -nE '(^|[^#])\bstty\b' "$f" && printf '\n-> %s\n' "$f"
done
```

- 如果命中类似 `stty -ixon`，改成只在 TTY 下执行：

```bash
[[ -t 0 ]] && stty -ixon
```

- 如果问题和 login shell 读取 rc 文件有关，也可以在 `~/.trae/traecli.toml`
  里临时关闭：

```toml
allow_login_shell = false
```

- 修改配置后需要退出并重新启动 TraeX。若仍复现，收集 `/feedback`、相关 shell
  启动文件片段、是否在 tmux/SSH/CloudIDE 中运行，以及完整报错。

## Goals

通用结论：

- 开启 goals：

```toml
[features]
goals = true
```

- 重启 TraeX 后使用 `/goal`。
- 用 `/status` 或 `/context` 确认 goal 状态是否生效。

如果 `/goal` 让用户感觉工具变少、卡住或无法退出：

- 收集模型家族、版本和 `/feedback`。
- 先建议升级到目标 channel 的较新版本。
- 临时规避可以 interrupt 当前 turn，或在问题只出现在某个模型家族时切换模型。

## 权限模式和反复弹确认框

通用结论：

- 让模型“用自然语言关闭 sandbox”不是可靠改权限方式。
- TUI 里用 `/permissions`。
- 启动时可以显式指定权限模式。
- TraeX 的 full-access 等价路径包括：
  `--dangerously-bypass-approvals-and-sandbox` 和
  `--permission-mode bypass_permissions`。
- 部分版本里 `Shift+Tab` 可以切换交互模式，具体以当前 `/help` 为准。
- 如果用户问“一键授权”，当前功能正在开发；临时可选本会话内
  `Yes, and don't ask again ...`、`traex -y`、`Shift+Tab`，或通过
  `/permissions` 切到 Auto / Full Access。提醒 Full Access 风险更高，只建议在
  可信仓库或临时任务中使用。

如果用户说 default mode / default 模式中途切换 mode 后仍反复弹框：

- 常见说法包括：选择了 `3` 仍继续问、第三次选择仍没有生效、已经选
  `Yes, and switch to Auto mode` / `Yes, and switch to Full Access Mode` 但后续
  仍然提问、预期“不再向我提问”或“直接开干”但没有发生。
- 这类现象按权限 / 审批模式切换未即时生效的已知 bug 处理，不要按普通 TUI
  交互问题路由。
- 不需要继续追问“是否同一个文件 / 同一个操作”才能给结论；推荐让用户自行选择一种
  长期生效的替代方式：通过 `/permissions` 修改 mode，或直接修改
  `~/.trae/traecli.toml`。

### 怎么配置能避免反复弹窗让人工确认？

如果用户希望尽量减少人工确认，可以把审批交给 auto-review，并按任务风险选择
sandbox 范围：

```toml
sandbox_mode = "danger-full-access" # 也可以按需要改成 "workspace-write" 或 "read-only"
approval_policy = "on-request"
approvals_reviewer = "auto_review" # AI 审批；如果要用户自己审批，改成 "user"
```

`approvals_reviewer = "auto_review"` 表示越权文件、网络、MCP 审批等请求优先交给
AI 审批器判断，能减少人工弹窗。`danger-full-access` 会移除普通 sandbox 保护，
只建议在可信、隔离的工作区里使用；日常开发更推荐 `workspace-write` 搭配
`auto_review`。

配置后重启 TraeX，用 `/status` 或 `/permissions` 确认当前生效的 sandbox、
approval policy 和 reviewer。

如果用户想通过规则减少确认次数：

- 权限规则支持按前缀方式配置，常见位置是 `~/.trae/rules/*.rules`。
- 当前不要承诺支持任意通配符或正则；先让用户按前缀规则配置，并参考当前版本
  支持的 rule fields。

如果配置了 `approvals_reviewer = "auto_review"` 但状态栏仍没有 Auto mode，让用户
在 `/permissions` 里选择目标 mode，或直接检查并修改 `~/.trae/traecli.toml`。
如果两种替代措施仍不生效，再收集 `/status`、`/permissions`、当前配置片段和
`/feedback` 后转权限 owner 继续排查。

如果用户点击 `Yes, and switch to Auto mode` 或
`Yes, and switch to Full Access Mode` 后没有生效，按已知 bug 处理，当前正在修复。
推荐替代措施：

- 方式一：在 TUI 里运行 `/permissions`，手动选择目标 mode。
- 方式二：直接修改 `~/.trae/traecli.toml`，设置目标 mode 对应的长期自动审批配置。

```toml
sandbox_mode = "danger-full-access" # 也可以按需要改成 "workspace-write" 或 "read-only"
approval_policy = "on-request"
approvals_reviewer = "auto_review" # AI 审批；如果要用户自己审批，改成 "user"
```

如果用户说界面里显示的是 workspace-edit，可以按配置里的 `workspace-write` 理解。
修改后重启 TraeX，再用 `/status` 或 `/permissions` 确认生效。

## 非交互 exec 能使用 plan 模式吗？

通用结论：

- `/plan` 和 plan permission mode 只支持交互式 TUI；非交互
  `traecli exec` / `traex exec` 不支持 `--permission-mode plan`。
- 如果用户想在非交互模式里“只分析、不改文件”，让用户省略 `permission_mode`，
  或显式使用 read-only sandbox，并在 prompt 里写清楚只输出计划。

```bash
traecli exec --sandbox read-only "只分析需求并输出执行计划，不做文件修改"
```

- 如果用户看到
  `` `permission_mode = "plan"` is only supported in interactive TUI mode ``，
  直接按上述口径纠正；不要继续建议 `exec --permission-mode plan`。
- 非交互 exec 一次请求结束后没有 TUI plan 模式里的人工提问、确认执行等交互流程；
  不能靠“下一次带 session id”复刻 TUI plan 的中途确认语义。
- GPT 路径如果需要默认模式下的选项式追问能力，当前工具名是
  `request_user_input`，不是 `askUserQuestion`；可先用
  `traecli --enable default_mode_request_user_input ...` 验证。用户要求写入配置或
  默认开启时，按 feature 诉求转人工评估，不要承诺已有稳定配置项。
- 非交互 / CI 里如果遇到 `failed printing to stderr: Resource temporarily
  unavailable (os error 11)` 这类 panic，先收集 `traex --version`、完整 CI 日志、
  stderr 是否被非阻塞管道/关闭 FD 接管，以及是否可复现；临时规避是把 stderr
  重定向到文件，或确保调用方持续消费 stderr。

### 什么是 yolo？

`yolo` 通常指“直接放开权限跑”的模式：不走人工审批，并使用
`danger-full-access` 这类高权限 sandbox 配置。它适合可信、隔离、可回滚的环境，
不适合在包含敏感文件或重要未提交改动的目录里默认开启。

常见配置档写法是单独建文件，不要写 legacy `[profiles.yolo]`。

例如 `~/.trae/yolo.traecli.toml`：

```toml
sandbox_mode = "danger-full-access"
approval_policy = "never"
```

使用时执行 `traecli --profile yolo` 或 `traecli -p yolo`，也可以在 TUI 里用
`/permissions` 切到 Full Access。需要减少弹窗但仍保留风险判断时，优先用
`approval_policy = "on-request"` 加 `approvals_reviewer = "auto_review"`，不要直接
yolo。

## `--worktree-mode git|reflink` 有什么区别？

通用结论：

- 默认是 `git`。它使用 Git 原生 worktree，通常只带入仓库管理的文件。
- `reflink` 会在支持 CoW 的文件系统上把非 Git 内容也复制到新工作区，空间开销小，
  但文件数量多时会更慢，并且依赖文件系统能力。
- macOS APFS 通常支持 reflink；Linux 下通常需要 XFS 或 Btrfs。文件系统不支持时，
  不要承诺 reflink 可用。
- 如果用户说 `-w` 默认从 `master` 拉分支，先确认当前版本。部分实现会按
  `origin/HEAD`、`origin/main`、`origin/master`、当前 `HEAD` 的顺序选择基线；
  不要直接承诺一定从当前分支创建。

## 后台 agents、任务列表和状态残留

通用结论：

- 用 `/ps` 查看后台 agents / tasks。
- 支持时用 `/stop` 或 process manager 停止任务。
- 状态栏显示类似 “background agents running... you can still chat” 时，表示主
  chat 仍可继续，同时后台任务还在运行。

如果用户说任务已经结束但还显示有任务：

- 收集 `/ps` 输出和 `/feedback`。
- 保留 thread id 和反馈归档链接。
- 除非 `/ps` 证明真实进程还在跑，否则这类 multi-agent 任务列表不一致更像
  TUI / 状态同步问题。
- 后台 shell 完成通常会唤醒启动它的 agent；如果是 subagent 启动的后台 shell，
  唤醒也应回到该 subagent。若 shell 已结束但 subagent 没继续执行，先收集 `/ps`、
  session id、subagent thread、shell 命令和 `/feedback`，不要把它解释成需要人工
  “提醒主 agent”的正常交互。
- 需要确保 subagent 等命令结果再继续时，提示它把关键命令跑在前台。前台运行不会比
  后台运行本身多占明显资源，但会阻塞该 subagent 直到命令结束。

如果用户想在 skill / 集成测试里先执行 `kubectl port-forward`：

- `kubectl port-forward` 这类长驻连接不要依赖单次 TraeX 工具调用 / sandbox
  生命周期；命令结束、sandbox 退出或会话清理时，连接可能会被一起杀掉。
- 稳定方案是把 `kubectl port-forward svc/xxx 8888:8888` 放到外部终端里保持进程。
- 如果这是项目固定前置步骤，可以把约定写入 `~/.trae/cli/rules/default.rules`，
  让 TraeX 在相关任务前按项目规则处理；规则语法参考 Codex rules 文档。

### 怎么控制 subagents 数量？

统一配置 `features.multi_agent_v2.max_concurrent_threads_per_session`。用户不需要
区分具体模型或内部 multi-agent 版本。

推荐写法：

```toml
[features.multi_agent_v2]
enabled = true
max_concurrent_threads_per_session = 7
```

`max_concurrent_threads_per_session` 表示同一个 session 里最多同时打开的线程总数，
包含主线程。所以上例大约还能并发 6 个 subagents。

如果启动报：

```text
error loading configuration: agents.max_threads cannot be set when multi_agent_v2 is enabled
```

让用户删除 `[agents]` 下的 `max_threads`，改用：

```toml
[features.multi_agent_v2]
enabled = true
max_concurrent_threads_per_session = 7
```

`[agents]` 里仍可保留不冲突的配置，例如：

```toml
[agents]
max_depth = 1
job_max_runtime_seconds = 1800
```

如果用户问 headless、remote-control 或 app-server 场景能不能自主启动 subagent：

- 当前可以使用同一套 subagent 能力，但 headless 场景里 subagent 可能包含异步通信，
  主线程不一定能可靠判断子任务是否已
  完全结束；如果用户依赖严格完成时序，建议在 prompt 里明确要求只按同步模式使用
  subagent。

如果用户问自定义 agent 文件格式：

- Markdown agent 放在 `~/.trae/agents/<name>.md` 或 `<repo>/.trae/agents/<name>.md`，
  通常不需要在 `traecli.toml` 里声明。
- TOML agent 才通过 `[agents.<name>] config_file = "...toml"` 声明。
- 如果把 Markdown 文件写进 `config_file`，会看到 `TOML parse error` 和开头 `---`
  相关报错；删除 `traecli.toml` 里的对应 `[agents.<name>]`，保留 `.trae/agents/*.md`。
- 自定义 agent 默认跟随主 agent 当前模型和 harness；不要承诺单个 Markdown agent
  能独立选择 codex / claudecode harness。

## 复制用户原文或原始 transcript

通用结论：

- 想复制原始文本时用 `/raw`。
- 普通复制流程可以用 `/copy`，前提是当前版本支持。

如果复制出来的内容带了 UI 引用块或视觉前缀，说明复制的是 TUI 渲染视图；
要拿精确 prompt 文本，应切到 `/raw`。

## Esc 能清空当前输入吗？

当前口径：

- 最新 alpha 已支持双击 `Esc` 清空当前输入，可建议用户执行
  `traex update --channel=alpha` 后体验。
- `/clear` 是清空当前终端界面的命令，不是“只清空输入框”。如果用户只是想删掉
  当前输入，优先建议双击 `Esc`、`Ctrl+U` 或 `Ctrl+K`。
- 如果用户仍在旧版，`Esc` 主要用于中断当前回合；输入框为空时连按可以进入
  回溯/编辑上一条消息。
- 旧版清空当前输入可以用 `Ctrl+U` 删除到行首，或 `Ctrl+K` 删除到行尾。
- 如果用户在最新 alpha 仍无法双击 `Esc` 清空输入，收集终端应用、`$TERM`、
  是否 tmux / cmux、TraeX 版本和 `/feedback`。

## “现代终端特性”具体指什么？

通用结论：

- 这里通常指 TraeX TUI 在较新的终端协议和能力上能提供更接近 IDE 的交互体验。
- 常见差异包括：更可靠的特殊按键识别、多行输入、图片粘贴、大段文本粘贴保护、
  transcript/raw 视图浏览，以及更稳定的颜色和输入框渲染。
- 不同终端、SSH、tmux / cmux、Docker 和 CloudIDE 组合对这些能力的支持不同；
  如果表现不一致，先收集终端应用、`$TERM`、是否远程连接以及 TraeX 版本。

常见例子：

- `Shift+Enter`、`Ctrl+J` 或 `Alt+Enter` 插入换行，而不是直接发送。
- macOS 终端里的 `Option+Enter` 只有在终端把 Option 映射为 Alt / Meta 时才等价于
  `Alt+Enter`；如果不生效，先试 `Ctrl+J`，再用 `/terminal-setup` 或重启 TraeX
  重新进行终端能力探测。
- `Ctrl+V` / `Cmd+V` 粘贴图片；远程开发机里通常需要先上传图片，再用 `-i <file>`。
- 大段文本粘贴可能显示成 `[Pasted Content N chars]`，提交时再展开，避免 TUI 刷屏。
- `Ctrl+O` 查看 transcript，`Alt+R` 或 `/raw` 切换原始文本视图，便于复制。
- 终端能力异常时，当前版本支持的话，运行 `/terminal-setup` 查看可用修复建议。

## zellij 分屏里 TraeX 无法滚动

通用结论：

- 先区分“普通终端可以滚动，zellij 分屏后不能滚动”还是 TraeX 自身 transcript/raw
  无法浏览；前者更像终端复用器兼容问题。
- 临时查看或复制输出时，先用 `Ctrl+O`、`/raw` 或 `Alt+R`；如果需要终端自身
  scrollback，可尝试用 `traecli --no-alt-screen` 启动。
- zellij 0.44.x 仍可能受 pane 鼠标模式、首次启动/退出后恢复状态影响；收集
  zellij 版本、TraeX 版本、是否分屏、是否 resume、是否可在 Codex 同版本下复现。
- 如果 `TRAECLI_TUI_DISABLE_KEYBOARD_ENHANCEMENT=1 traex` 仍不能恢复滚动，按 TUI
  兼容问题记录，附 `/feedback` Thread ID 转 owner 跟进，不要继续反复让用户切换
  同一个环境变量。

## 怎么把 Enter 改成换行、Shift+Enter 改成发送？

通用结论：

- TraeX 支持通过 `/keymap` 调整 TUI 快捷键。
- 如果用户希望把默认的 `Enter` 发送、`Shift+Enter` 换行互换，先让用户在 TUI 中运行
  `/keymap`，按界面提示修改发送和换行对应按键。
- 如果 `/keymap` 中没有对应项，或修改后不生效，再收集 TraeX 版本、终端应用、
  `$TERM`、是否 SSH / tmux / cmux，以及 `/feedback`。

## 怎么让 TraeX 输出高亮更像 Coco？

通用结论：

- TraeX 当前没有“一键切回 Coco 同款高亮”的开关。
- 可以先在 TUI 里用 `/theme` 选择更适合代码高亮的主题，再用 `/color` 调整配色。
- 如果是终端颜色能力、远程 SSH 或 CloudIDE 导致显示偏淡，运行
  `/terminal-setup` 查看当前环境可用的修复建议。
- 新版 TraeX 对 shell 命令和代码块的高亮通常更细；普通 Markdown 文本可能比
  Coco 旧版更素，这通常是显示风格差异，不要直接按 bug 处理。

如果用户希望尽量接近截图里的旧版效果，收集：

- `/theme` 当前可选项或当前主题。
- 宿主终端名称、是否 SSH / 远程开发机 / CloudIDE。
- TraeX 版本和 `/color` 当前配置；必要时补 `/feedback`。

## 怎么复制粘贴图片？

在 TUI 输入框里直接粘贴图片：

- Linux / Windows：通常用 `Ctrl+V`。
- macOS：通常用 `Cmd+V`，也可以尝试 `Ctrl+V`。

图片会作为附件加入当前消息。启动时要给初始 prompt 附图片，可以用：

```bash
traecli -i /path/to/image.png "帮我看一下这张图"
```

注意：远程开发机 / SSH / CloudIDE 场景目前不支持把本地剪贴板里的图片直接粘贴到
远程 TUI。先把图片上传到远程开发机，再用 `-i <file>` 附加图片，或在本地终端里
运行 TraeX。

如果一定要在本地粘贴图片、同时让执行发生在开发机上，可以让开发机启动 app server：

```bash
traex app-server --listen ws://0.0.0.0:4222
```

再在本机连接：

```bash
traex --remote ws://<开发机 IP>:4222
```

如果服务端启动时配置了 `--ws-auth`，客户端连接也必须带同一份认证；临时排障时可先
去掉服务端的 `--ws-auth` 验证链路是否恢复。

这种方式相当于本机 CLI 连接远端执行，操作成本更高；普通场景优先推荐上传图片后
用 `-i <file>`。

## 每轮会话会把 reasoning 块继续发给模型吗？

不会把界面里展示出来的完整私有 thinking / reasoning 原文原样再发给模型。

会继续带入的是会话里被记录的上下文项；如果当前模型或 provider 返回了可记录的
reasoning 摘要或相关输出，它可能作为后续上下文的一部分参与下一轮。用户关心“完整
thinking 原文是否继续喂回去”时，结论是否定的。

## 终端乱码、Ctrl-C 异常、resume 里 Enter 无效

通用结论：

- 先收集终端应用、`$TERM`、是否在 tmux / cmux、操作系统和 TraeX 版本。
- 当前版本支持时，运行 `/terminal-setup` 并按建议调整。
- 如果是旧内测版本现象，优先建议升级。

TUI 输入卡住时：

- 先确认是否有嵌套提示，例如 SSH fingerprint 确认。
- 如果 `Ctrl+C` 被渲染成转义字符而不是中断，收集终端信息和 `/feedback`；
  不要直接认定是 agent loop 根因。
- 如果用户用 `Ctrl+Z` 挂起 TraeX，再用 `fg` 恢复后 TUI 无法继续交互，按产品问题
  记录。临时规避是不要用 `Ctrl+Z` / `fg` 挂起恢复；直接重启 TraeX，再用
  `traecli resume --last` 或 `traex resume --last` 恢复最近会话。

resume picker 里 Enter 无效时：

- 试 `traecli resume <session-id>`，或在当前 help 支持时用
  `traecli resume --last`；如果 `traecli` 被旧版占用，则改用 `traex`。
- 如果用户版本较旧，建议升级后再试。

macOS 执行 shell 命令出现 `setlocale: LC_ALL: cannot change locale (C.UTF-8)`
warning 时：

- 这是 TraeX 注入的 locale 在 macOS 上不可用导致的 warning，通常不影响命令继续
  执行。
- 临时规避是在启动 TraeX 前设置 macOS 常见 locale，例如：

```bash
export LC_CTYPE="zh_CN.UTF-8"
```

- 如果用户环境主要使用英文，也可以改成 `en_US.UTF-8`。改完重新启动 `traecli`
  或 `traex` 后再验证。

## 怎么让 TraeX 用中文回复？

先在启动 TraeX 前设置中文 locale：

```bash
export LANG="zh_CN.UTF-8"
```

然后重新启动 `traecli` 或 `traex`。如果只是本次对话希望中文，也可以直接在
prompt 里说明“请用中文回复”；但长期默认更推荐在 shell 环境里设置 `LANG`。

如果用户使用 O3 / Opus / Claude Code 等模型时，中文输入偶发得到日文回复，先确认
上述 locale 和 prompt 是否已明确中文。当前这类语言误判可能来自模型侧行为，也可能
被网络出口、产品侧上下文或默认注入的时间/地址等信息放大；TraeX 暂时没有稳定的
本地开关能彻底规避。可建议用户在当前会话里补充“后续请始终使用中文回答”，必要时
切换其他可用模型或网络环境对照验证。

## TraeX 有 VS Code 插件吗，怎么配置？

普通 CLI 使用不需要单独安装 VS Code 插件。如果用户只是希望 TraeX 输出的文件链接
用 VS Code 打开，在 `~/.trae/traecli.toml` 里配置：

```toml
file_opener = "vscode"
```

保存后重启 `traecli` 或 `traex`。

如果用户想把 TraeX 接入 VS Code 作为编辑器内 agent，优先说明官方插件仍在推进中。
当前可先考虑安装支持 ACP 的 VS Code 插件，然后配置 agent 命令：

```json
{
  "TRAE CLI": {
    "command": "traex",
    "args": ["acp", "serve"]
  }
}
```

如果用户机器上的 `traecli` 已确认是新版 TraeX，也可以把 `command` 改成
`traecli`；升级过渡期不确定时优先用 `traex`。

## ACP 和 SDK 集成

通用结论：

- TraeX 支持 ACP，常见入口是 `traecli acp serve`；如果 `traecli` 被旧版占用，
  则改用 `traex acp serve`。
- 用户想把 TraeX 接入 harness 或编辑器侧 agent 时，优先建议 ACP。
- 当前 ACP 入口是 stdio 方式：由本地 ACP client 启动 `traecli acp serve` /
  `traex acp serve` 并通过标准输入输出通信。不要把它说成“在远端主机启动 ACP server，
  本地 ACP client 直接连过去”的 remote ACP。
- App Server 协议是 Codex 专用协议，TraeX 因为要适配多套 harness，可能存在
  实现和兼容细节差异；除非用户明确依赖 Codex App Server，否则不要默认推荐。
  需要远端开发机执行、本地连接时，走 `traex app-server --listen ws://...` 加
  `traex --remote ws://...` 这条 app-server 路径。

用户问 Codex SDK 是否兼容时：

- GPT 模型路径通常更接近 upstream Codex 行为；非 GPT 模型家族可能存在兼容差异。
- 除非用户明确需要 upstream Codex SDK API，否则产品集成优先推荐 ACP。
- 继续追问用户需要注入或观测什么：hooks、prompt、tool events、session state 等。

用户问 Coco hooks / OpenAPI 是否兼容时：

- hooks 先按兼容处理，但要用 `/hooks` 和当前版本确认实际可用事件。
- Coco 相关 OpenAPI 不要承诺已经被 TraeX 完整替换；如果用户做平台集成，说明
  后续方向是 managed agent API，Trae CLI Next 只是可选接入之一。

ACP 启动参数：

- ACP 入口不要直接传交互式 TUI 参数，例如 `--model` 或 `--yolo`。
- 模型优先用配置覆盖传入：

```bash
traecli -c model="gpt-5.1" acp serve
```

- 如果 `traecli` 被旧版占用，则改用 `traex -c model="..." acp serve`。
- ACP 当前不支持指定 reasoning effort；不要建议用 `--effort` 或
  `-c model_reasoning_effort=...` 作为已支持方案。
- `--yolo` 对应的 bypass 权限语义，可以让用户先试：

```bash
traecli -c permission_mode=bypass_permissions acp serve
```

- 如果同时要设置模型和 bypass 权限：

```bash
traecli -c model="gpt-5.1" -c permission_mode=bypass_permissions acp serve
```

- 如果用户强调 Coco ACP 兼容行为，先用上面的 `-c` 方式对齐；仍不兼容时转人工确认。

ACP session 恢复：

- 恢复已有会话走 `session/load`；当前不要承诺有单独的公开 `session/resume` 能力。
- `session/load` 恢复结果里有会话级时间字段，常见是 `createdAt` 和 `updatedAt`。
- 如果同时取回历史 turn，turn 级通常还有 `startedAt` 和 `completedAt`。
- 这些时间字段按 Unix 秒级时间戳理解。

平台侧接入：

- 只有对方平台明确支持通过 stdio 启动 ACP agent，并允许配置 `command` / `args`
  时，才按 ACP 启动命令接入。
- 新版命令可用时，`command` 可填 `traecli`，`args` 填 `["acp", "serve"]`。
- 如果机器上的 `traecli` 还是旧版占用，`command` 改成 `traex`，`args` 仍为
  `["acp", "serve"]`。
- TTADK 等具体平台的配置字段和接入方式要以该平台文档或配置 schema 为准；没有
  一手证据时，不要把上面的通用 ACP 启动方式写成 TTADK 的确定配置结论。

ACP command 和 skill：

- `AvailableCommandsUpdate` 当前主要表达 slash command 列表，不要用它判断插件
  skill 是否加载。
- 插件 skill 不是独立 command；即使 CLI 里出现 `/skill` 辅助展示，实际调用语义
  仍会转成 `$<skill>`。
- 当前没有稳定的 ACP event 可以一次性拿到所有插件 skill；如果集成方需要这个能力，
  按 feature 诉求转人工评估。

用户问 Codex 远端 compact 是否支持时：

- 当前不要承诺支持 Codex 的远端 compact；如果没有开放 API 能力，TraeX 无法
  直接复用。
- 可以建议先使用本地 `/compact`，并收集模型、上下文长度和任务类型，用于判断
  是否需要更长上下文或更高能力模型。

## 自定义模型

通用结论：

- 新增自定义模型只推荐 Coco 兼容配置形式：顶层 `model` / `model_provider`、
  `[[models]]` 元信息，以及 `[models.<provider>]` 连接信息。
- 旧的 Codex 原生 `[model_providers.*]` 写法已废弃，不要在新 FAQ 或用户引导里展开。
- `harness_mode` 是必须重点确认的模式选择字段。它会影响系统提示词、工具协议、
  历史消息组织和模型行为风格；配置错了即使请求能打通，也可能表现为工具调用差、
  输出风格不对、指令遵循变差或上下文处理异常。
- `context_window` 是必须按真实模型能力填写的上下文窗口。它会影响 `/context`、
  compact 触发和长上下文预算；写得过大会晚 compact 并增加服务端超窗风险，写得过小
  会过早 compact，影响可用上下文。它按模型侧总上下文预算理解，不会放大服务端真实
  window；拿不准时填保守值。
- 长输出模型同时配置 `output_tokens_hard_limit` 和 provider block 里的 `max_tokens`。
  例如模型总窗口约 1M、最大输出 128K 时，常见写法是
  `context_window = 872000`、`output_tokens_hard_limit = 128000`、`max_tokens = 128000`。
- 如果模型支持图片输入，必须在 `[[models]]` 里声明
  `supported_mime_types = ["image/*"]` 或具体图片 MIME 类型。TraeX 会把它转成最终
  model catalog 的 `input_modalities = ["text", "image"]`；TUI 粘贴图片和提交前检查
  看的是最终 `input_modalities`。
- `model_family`、`prompt_hint` 已废弃，只在旧配置兼容场景中出现。
- provider block 决定请求协议：`[models.open_ai]` 走 Chat Completions，
  `[models.byted_gpt]` 走 Responses，`[models.claude]` 走 Anthropic Messages，
  `[models.gemini]` 走 Gemini GenerateContent。
- provider 协议必须匹配服务端真实接受的请求体。不要把 Chat Completions 的 `messages`
  endpoint 配成 Responses，也不要把 Responses 的 `input` endpoint 配成 `open_ai`。
- 用 `/status` 和 `/model` 确认配置的模型、provider、harness 和 base URL 是否加载并生效。
- 让用户贴配置时必须脱敏 API key、AK、token、cookie 和内部鉴权 header。

最短示例：

```toml
model = "my-chat-model"
model_provider = "custom"

[[models]]
name = "my-chat-model"
context_window = 128000
output_tokens_hard_limit = 16384
harness_mode = "codex"
# 只有模型和网关确实支持图片输入时才加这一行。
supported_mime_types = ["image/*"]

[models.open_ai]
base_url = "https://api.example.com/v1"
api_key = "${MY_CHAT_API_KEY}"
max_tokens = 16384
```

保存配置或修改环境变量后，重启 TraeX，再用 `/status` 确认当前 `model`、`provider`
和 `harness_mode`。

如果一个 provider 支持多个模型，写多个 `[[models]]` 条目，让 `/model` 按
`[[models]].name` 展示和切换；真实上游模型名通过 provider block 的 `model` 或
`extra_fields.model` 等协议字段传递。不要继续建议旧 `[model_providers]` 写法。

检查自定义模型效果时，不要只看请求是否 200。必须同时确认：

- `harness_mode` 是否符合模型应该使用的 harness。
- `context_window` 是否接近服务端真实可用窗口。
- provider block 是否匹配服务端真实协议。
- 图片输入场景里，运行 `traex debug models --remote`，确认目标模型的
  `input_modalities` 包含 `"image"`。

火山方舟同时支持 Responses API 和 Chat Completions。两种协议都可以接，但要按
服务端 endpoint 选择对应 provider block，不要混用。

如果 `traecli` 仍是旧 Coco，就把命令改成 `traex`。保存配置或修改环境变量后，
重启 TraeX，再用 `/status` 确认当前 `model` 和 `provider`。

如果用户只是想临时切到自己的 OpenAI / Codex provider，可以先用：

```bash
traecli -c model_provider=openai
```

切换 provider 后，`/model` 里的模型列表会替换为当前 provider 的列表，不会和
TraeX 内置 provider 的模型列表共存。要切回内置 provider，用：

```bash
traecli -c model_provider=trae
```

如果任意输入都报 `Missing environment variable: PC_LLM_AK`，先让用户用
`/model` 切换到非 AIME 注入的自定义模型，并以输入行下方实际选中模型为准。
切换后恢复通常说明是当前自定义模型的 `env_key` 未在启动 TraeX 的终端中生效；
继续使用该模型时再补齐 `PC_LLM_AK` 并重启。

如果 provider 需要自定义鉴权 header，比如 Claude-compatible / SuperRelay 类
网关常用 `x-api-key` 原始 token，可以这样配：

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

说明：

- 方舟 Responses endpoint 是 `https://ark-cn-beijing.bytedance.net/api/v3/responses`。
  TraeX 会在 `[models.byted_gpt].base_url` 后追加 `/responses`，所以配置里写到
  `/api/v3` 即可，不要把 `/responses` 重复写进 `base_url`。
- `api_key = "${ARK_API_KEY}"` 会从环境变量读取 key，并按默认 Responses 鉴权发送
  `Authorization: Bearer <key>`。
- `model = "ep-..."` 是真实方舟 endpoint id；`[[models]].name` 是 TraeX 里展示和选择
  用的名称，两者可以不同。
- 如果模型支持图片输入，Responses 协议会按 `input_image` / `input_text` 形态发送；
  仍需确认该 endpoint 自身支持 vision。

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

说明：

- 方舟 Chat Completions endpoint 是
  `https://ark-cn-beijing.bytedance.net/api/v3/chat/completions`。TraeX 会在
  `[models.open_ai].base_url` 后追加 `/chat/completions`，所以配置里写到 `/api/v3`
  即可，不要把 `/chat/completions` 重复写进 `base_url`。
- `api_key = "${ARK_API_KEY}"` 会从环境变量读取 key，并按默认 OpenAI-compatible
  鉴权发送 `Authorization: Bearer <key>`。
- 如果模型支持图片输入，Chat Completions 协议会按 `image_url` / `text` 形态发送；
  仍需确认该 endpoint 自身支持 vision。
- 上面两份方舟配置已通过原生 curl 和 TraeX Coco 兼容配置验证：Responses 与
  Chat Completions 都能完成请求。

ModelHub Responses API 已验证写法：

```toml
model = "gpt-5.4-modelhub-responses"
model_provider = "custom"

[[models]]
name = "gpt-5.4-modelhub-responses"
context_window = 272000
harness_mode = "codex"

[models.byted_gpt]
base_url = "https://aidp.bytedance.net/api/modelhub/online"
api_key = "${MODELHUB_RESPONSES_AK}"
model = "gpt-5.4-2026-03-05"
max_tokens = 16384
headers = { "X-TT-LOGID" = "traex-modelhub-responses-${SESSION_ID}" }
```

说明：

- ModelHub Responses endpoint 是 `https://aidp.bytedance.net/api/modelhub/online/responses`。
  TraeX 会在 `[models.byted_gpt].base_url` 后追加 `/responses`，所以标准 header
  配置里 `base_url` 写到 `/online` 即可。
- `api_key = "${MODELHUB_RESPONSES_AK}"` 会从环境变量读取 key，并按默认 Responses
  鉴权发送 `Authorization: Bearer <key>`；该写法已通过 TraeX 验证。
- 如果网关要求 `api-key` header，也可以加 `by_azure = true`，该写法同样已通过 TraeX
  验证。
- `model = "gpt-5.4-2026-03-05"` 是当前已验证能通的 ModelHub Responses 模型名。
  `glm-5.1` 在 Responses 路径会返回 `the current product doesn't support response API`。

ModelHub Responses query AK 已验证写法：

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

这里不能写成 `https://aidp.bytedance.net/api/modelhub/online?ak=...`。TraeX 当前会把
`/responses` 追加到 query 后面，变成 `?ak=.../responses`，导致 404。query AK 场景
需要写完整 `/responses?ak=...&_coco_path=`，让 TraeX 追加的 `/responses` 被 `_coco_path`
吸收。

ModelHub crawl endpoint 已验证写法：

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

说明：

- 这个 ModelHub crawl endpoint 实测接受 Chat Completions 风格的 `messages +
  max_tokens`，返回 `chat.completion`。
- 同一 endpoint 使用 Responses 风格 `input + max_output_tokens` 会失败，服务端报
  `Messages` required。因此不要配成 `[models.byted_gpt]`。
- `_coco_path=` 用来吸收 TraeX 自动追加的 `/chat/completions`，让真实请求 path
  仍停在 `/api/modelhub/online/v2/crawl`。
- `extra_fields.model` 用真实上游模型名覆盖展示名；否则服务端可能把展示名当模型名，
  返回 model/product 不存在。
- `context_window` 是 TraeX 客户端侧预算认知，影响 `/context`、compact 和模型列表展示；
  它不会放大服务端真实上下文窗口。配置错会直接影响长上下文效果和 compact 时机。

常见检查：

- endpoint、鉴权、provider block 和真实模型名要和服务端协议匹配。
- `harness_mode` 不能漏配或随便配；请求通不代表 harness 合适。
- `context_window` 要按服务端真实能力填；不要为了显示更大窗口随意写大。
- `[models.open_ai]` 默认按 Chat Completions 形态发请求；服务端如果只支持 Responses，
  不能用这个 block。
- `[models.byted_gpt]` 默认按 Responses 形态发请求；服务端如果要求 `messages`，
  不能用这个 block。
- 404 `Model not found` 通常先查 provider 侧模型名和路由映射，不要先判断为
  TraeX 本地工具执行问题。
- 普通对话能通但图片不通时，先确认 `[[models]]` 已写
  `supported_mime_types = ["image/*"]`，再确认该模型和网关支持 vision，并确认当前
  provider block 的图片 payload 格式是否被 provider 接受。
- 如果 TUI 提示 `Model ... does not support image inputs`，这是提交前本地能力检查：
  先用 `traex debug models --remote` 看该模型最终 `input_modalities` 是否包含 `"image"`。
- 发配置、日志或反馈包给别人排查前必须脱敏，不要粘贴 API key。

## 外部编辑器打不开怎么办？

通用结论：

- `/editor` 或外部 `$EDITOR` 报 `No such file or directory` 时，优先检查配置里的
  命令是否能在启动 TraeX 的同一个 shell 里直接执行。
- 例如配置了 `sublime`，先让用户运行 `which sublime` 和 `sublime --version`；
  如果命令不存在，需要把 Sublime Text 的命令行启动器加入 `$PATH`，或把 `$EDITOR`
  改成可执行文件的绝对路径。
- 不要只看 `$EDITOR` 环境变量是否存在；变量存在但命令不在 `$PATH` 里，也会打开
  失败。

## 反馈和 bug 上报

通用结论：

- 在出问题的 session 里使用 `/feedback`。
- 把生成的归档链接和 thread id 发到 issue 或反馈话题里。
- 同时提供版本、模型、cwd、启动命令和最小复现步骤。

复杂问题需要补充：

- 是否只在 TUI、`traecli exec` / `traex exec` 或 ACP 中复现。
- 是否只和某个模型相关。
- 截图里的精确文字或完整错误信息。
- 最近相关日志片段和 log id。

不要让用户粘贴 secrets。配置和日志在公开转发前都要脱敏。
