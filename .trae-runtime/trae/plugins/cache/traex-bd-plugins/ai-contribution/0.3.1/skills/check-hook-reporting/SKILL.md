---
name: check-hook-reporting
description: Check AI code contribution reporting in TraeX, including missing or duplicate reports, low contribution metrics, hook loading, queued versus delivered events, ECONNRESET or Mihomo issues, and bounded cache cleanup. Use when asked whether AI edits were reported or how to diagnose the ai-contribution plugin.
---

# 检查 AI 代码贡献上报

按“插件加载 → 工具采集 → 入队 → 服务端接收 → 看板归因”逐层找证据。默认只读检查已有会话；不要把 queued、旧版 ok、模拟接收或日志行数当作生产上报成功。版本升级、测试写文件等动作沿用用户已有授权；不确定目标会话时先检查可用元数据。

## 1. 确认运行版本和路径

- 记录实际 TraeX 可执行文件、版本、cwd、sessionId/turnId、检查时间窗口。用当前可执行文件的 plugin list（参数先看 --help）或 TUI /plugins、/hooks、/skills 确认插件启用与实际安装路径。
- 从该路径读取 .codex-plugin/plugin.json 和 hooks.json。0.2.1 为旧上报实现；0.2.2 为清理专用版，本来不会上报；0.3.0 恢复上报并限制缓存。对其他版本以安装文件为准，不拿仓库最新源码替代运行版本。
- 0.3.0 应声明 skills 和 hooks，包含 UserPromptSubmit、PreToolUse、PostToolUse、PostToolUseFailure、Stop。检查 plugin_hooks 功能和加载错误；同名本地/市场插件、遗留手工 hooks 不应重复启用。只摘取相关配置，不打印完整配置、认证文件或进程环境。
- CLI 主目录由 TRAE_HOME / TRAECLI_HOME 等决定；本插件默认数据目录独立位于操作系统 home 下的 .trae/hooks/ai-contribution-v2，只有 AI_CONTRIBUTION_LOG_DIR 会覆盖。不要因测试用了隔离 CLI home 就假定数据也隔离了。
- 当前插件使用 PATH 中的 Node、Git 和预打包 vendor/reporter.cjs；检查文件存在和 node --version、git --version 即可。不要沿用旧版 AI_CONTRIBUTION_NODE 或运行时 npm 安装建议。

## 2. 运行有界、只读诊断

已给定 runtime 路径时，直接把它作为 --log-dir 运行脚本；reports.jsonl 和 diagnostics.jsonl 是根目录下的文件，不是子目录。不要先递归 find/rg 运行目录。脚本输出包含本流程所需的批次、工具、容量与 GC 元数据，正常结果已足够下诊断结论。

停止规则：如果输出已给出批次结论、HTTP/code、重试次数和容量账本，直接汇报这些证据及缺口。摘要由本地日志解析而来，不需要另写 readFileSync 或 grep 再读一遍来证明摘要；这会绕过原脚本的读取上限。

相对于本 SKILL.md 找到 scripts/inspect-reporting.cjs，以解析出的绝对路径执行；示例占位符需替换：

~~~bash
node /ABS/skills/check-hook-reporting/scripts/inspect-reporting.cjs   --log-dir /ABS/runtime   --session SESSION_ID   --since 2026-09-14T17:00:00+08:00 --limit 20
~~~

- --log-dir 可省略，使用 AI_CONTRIBUTION_LOG_DIR 或 OS home 默认目录；--session、--turn、--since 可组合。时间必须有时区；只有 turnId 时使用 --turn。
- 脚本只读取当前及上一份 reports/diagnostics 日志和少量控制元数据；队列只统计文件数/字节，不读取代码正文，不发网络请求，不执行 GC，不启动 worker。它不会创建缺失目录。
- 先看 coverage：日志会轮转，completeHistory 始终为 false。损坏/截断/超限/读取失败或没有匹配记录只能说明证据不足。Stop 和过期事件可能不带 sessionId，脚本仅通过已观察到的 turn/batch 关系关联，关联信息轮转掉后无法恢复。
- reporting 按 batchId 合并重试；count 是批内代码事件数，不是代码行数。recentBatches 只显示最后 limit 项，汇总覆盖已读取且匹配的记录。runtime 是整个运行目录的当前非原子采样，不受会话筛选限制。
- readerProcessFlags 仅反映此次诊断进程；不能代替运行 TraeX 的环境。worker 文件存在不证明进程活着，dirty 账本不可当作可信容量。
- events 只汇总已知 count；unknownCountBatches 非零表示有批次缺少数量，不能把它们当作 0 事件。
- runtimeControlEvents 汇总无会话归属的 gc_failed / worker_failed，按时间筛选，不按 session 筛选；不要强行归因到指定会话。
- 只有脚本报具体读取问题或缺少决定性字段，才按该问题追加有界检查。不要为“交叉验证”读取 turn-snapshots/*.json、snapshot-blobs、outbox 正文，也不要全行 grep 可能含 dry-run 代码的原始日志。确需日志字段时用 JSON 解析，仅输出 IDs、事件、状态、计数、HTTP/code/requestId 白名单。

| 证据/结果 | 能说明什么 |
| --- | --- |
| diagnostics 中采集 ok、blockCount | 采集阶段执行，尚未证明投递 |
| ai_contribution_code / queued | 已进入待发送队列 |
| production_accepted | delivery 的 transport=mcs_production、status=accepted、httpStatus=200、responseCode=0 同时满足 |
| loopback_accepted / dry_run | 仅本地测试成功 |
| delivery_unknown | 请求可能已到服务端；为避免重复不会自动重放 |
| failed_attempt_no_later_confirmation | 窗口内只有失败尝试，需结合 safeToRetry、后续 worker 和队列判断 |
| queued_without_confirmation | 尚未找到投递结论；可能等待、暂停或证据已轮转 |
| queue_expired / conflicting_terminal_records / unverified_accepted | 过期或证据异常，不能宣称生产成功 |
| legacyOkRecords | 旧版 ok 不证明真实 HTTP 接收 |

生产 accepted 只证明接收端确认，不证明最终贡献率看板已归因。看板需另外核对账号、仓库、统计时间和处理延迟。

## 3. 定位断点

1. 加载：核对实际插件、五类 hooks 和 Node/Git 可用性。hook 返回 0 是 fail-open，不是上报成功。
2. 采集：确认修改位于真实 Git 仓库、且在工具实际作用范围内；通过 sessionId + turnId + toolUseId 配对 Pre/Post。缺 Pre 快照不会补报；纯聊天、只读、非 Git、只删除代码通常没有新增代码事件。失败工具如果已经写入有效代码，也可能有贡献。
3. 入队：查 reports 的 queued，以及 diagnostics 的缺快照/过滤/限额原因。正常日志不含代码正文；不要为排查去打印 outbox、blobs、turn 状态正文或把 DRY_RUN 开到日常工作目录。
4. 投递：按 batch 查 production_accepted、unknown、失败原因、暂停、队列和 worker 元数据。source=codex_post_tool_use 是兼容路径名称，不能据此判断实际使用 Codex；以真实 CLI 与受控事件中的 agent/model 为准。
5. 缓存/网络/归因：按需读 [references/diagnostics.md](references/diagnostics.md)。出现 reset 不先归因 SDK；检查 DNS、路由和代理命中证据。不要清空缓存、手工重放 unknown、自动改变全局代理或关闭 TLS 校验。

## 4. 仅在现有证据不足时做受控复现

沿用用户对真实 TraeX 测试的授权。普通“检查是否上报”先完成只读诊断；需要新代码/生产测试且尚未授权时说明具体测试和数据范围。

- 单独临时 Git fixture、CLI home、AI_CONTRIBUTION_LOG_DIR；测试旧目录迁移另设 OS home。记录实际分支/HEAD、remote 和 clean 状态，不硬编码 origin/main。确认 /tmp fixture 没有继承父级仓库。
- 用当前 CLI --help 和插件安装帮助安装本地版本，确认启用；不要用 --ignore-user-config 把待测插件配置也忽略。隔离 home 必须有有效模型访问配置，但不能输出认证材料。
- 让真实 TraeX 工具执行：修改已有文件、新增文件、shell/Python 写入、并发不同文件、worktree、写入后失败；再做只读、纯聊天、非 Git 等负例。用实际 session/turn/tool/batch ID 核验，不比较“前后多了几行日志”。不伪造 hook payload 代替真实产品链路。
- 先用 loopback 或 dry-run 验证格式/故障；这类事件不能计入生产成功。生产测试只使用已授权的测试代码、真实 endpoint 和正常 TLS；核对 HTTP 响应以及受控采集的身份/仓库/代码摘要，避免在报告中泄露正文。
- 不在普通诊断里重跑完整压力测试。只有缓存/并发问题才在隔离目录复验轮转、容量硬限、活跃引用保留、过期回收、重复终态和中断恢复。
- 结束后停止自己启动的测试进程，按具体 fixture 范围处理测试痕迹，保留精简证据；不递归清除用户运行目录或会话。

## 5. 汇报

先给当前证据层级和断点，再给下一步。附实际版本/安装路径、session/turn/时间窗口、批数与事件数、生产和模拟结果、缓存账本可信度、日志覆盖缺口。分开说明已验证与未验证项；没有看板证据就明确未验证最终归因。
