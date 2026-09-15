# 0.3.0 本地验证记录（2026-09-14）

当前状态：本地实现、隔离测试与真实 TraeX 的生产 MCS 接收已通过，进入 MR review。最初的 TLS reset 已定位为测试机器 Mihomo 广告规则拦截；绕过只对隔离测试进程生效。尚未核验下游贡献率看板的最终提交归因，不能以接收成功代替看板入桶。未部署到用户的常用 TraeX，未合入或发布。

## 环境和来源

- 插件仓库 main 基线：87abe40292d3aeeaf254d3f72359fd1fefaa99df。
- 本地分支：feat/ai-contribution-reactivate-bounded-20260914。
- 状态事务基线参考 !104/de4fa38，恢复后增加根级容量/GC 协议。
- Linux，Node v22.23.2，真实 CLI：traecli 0.0.0+5e6f9857.dirty(internal edition)。CLI 默认选择 GPT-5.4。
- 隔离 TRAE_HOME、CLI home、运行目录与 Git 测试仓库。0.2.2 共存测试额外隔离 OS home。
- SDK bundle 274,244 bytes，SHA256 02f0332c407224256a6f430e59bf418fdb89cf7eaa6d826840aa5809d2d390dc；重复构建一致。TraeX plugin validate 通过。

## 自动测试

npm test 包含十二组测试：旧目录清理、路径快照、24 进程并发状态、终态去重、锁/claim 硬化、transition 崩溃恢复、完成摘要、真实 SDK 队列、单 worker、容量边界、存储和 HTTP、只读诊断。

验证点包括：Write/Edit、apply_patch、失败工具、Stop 恢复、缺失 Pre 不补报、超大文件缩小不误报；并发 Post/Stop 只产生一个批次；prepare/report_started 崩溃；PID 复用；锁发布失败和代替换；硬限保留活跃引用；队列拒绝不占用 claim；过期队列清理；日志轮转；symlink 和越界路径拒绝；HTTP 200/e=0、拒绝、坏 JSON、超时；发送中断不重放；12 个并发启动请求只运行一个 sender；暂停/恢复。

10,000 轮固定负载使用降低后的测试上限：1 MiB 总量、512 KiB 高水、32 个完成摘要、4 KiB 日志、每 32 轮主动 GC。每轮创建唯一 blob 并完成状态。最近一次采样：文件内容总大小约 9.7–17.3 KB，文件实际分配块约 156–348 KiB，文件数 39–87；结束回收后只保留受保护的活跃引用。该结果验证固定负载稳定性，不代表 10,000 次真实模型调用，也不代替长时间线上观察。

## 真实 TraeX 场景

后续场景使用本机 HTTP 接收端核对 SDK/Tea envelope 的代码、文件、模型、用户和 session/message，响应为 HTTP 200/e=0。下表的“接收”仅指 loopback，**不算生产遥测服务验收**。

| 场景 | 结果 | session |
| --- | --- | --- |
| apply_patch 修改 + 新增，生产地址 | 2 个正确批次；TLS 建连 ECONNRESET，0 个生产确认 | 01a09f33-d0ae-7040-a39d-a4c155b236a0 |
| shell 重定向、Python 间接写、写后 exit 7 | 3 个事件，代码和归因匹配，loopback 接收 | 01a09f35-f7fa-7d81-bb42-c3ada678f5a4 |
| detached Git worktree 写入 | 1 个事件，loopback 接收 | 01a09f36-90a5-7b23-b13c-55b21fb0cffd |
| 只读、纯删除、文档、ignored、dist | 0 个事件，符合预期 | 01a09f36-f047-7860-88a0-45e3b178018b |
| 真实非 Git /tmp 目录 | 0 个事件，诊断 cwd_not_git_repository | 01a09f3a-aa7b-7de2-aac9-12629b95e16f |
| 旧 0.2.2 清理 + 新 0.3.0 reporter 共存 | apply_patch 1 个事件，旧目录清空、新目录和共享 npm 保留 | 01a09f39-6740-78a1-9546-d7c77eb43a35 |
| PAUSED 下写代码 | 代码成功写入，0 个事件、无新增轮次 | 01a09f39-8ce3-7ee1-bc8a-18c0722023a7 |
| 真正重叠的两个 exec（各 sleep 2 秒） | 两个 started 先于任一 completed；2 个独立事件且各一次 | 01a09f3c-caf7-73b3-8015-e2b9ed28c0ea |

首次隔离启动使用 ignore-user-config，导致本地插件启用配置未加载；之后去掉该参数才开始有效验证。最初 non-git fixture 位于 HappyClaw 上层 Git 仓库内，正常产生 1 个事件；重新移到 /tmp 并验证 git rev-parse 失败后，真实非 Git 场景为 0 个事件。上述两次无效 fixture 不计入通过项。

当前 CLI 的 exec 工具通过 hook 映射为 Bash；Write/Edit payload 由自动测试覆盖，未声称真实 CLI 调用了它们。

最终代码复测：session 01a09f42-6975-7c81-bb04-deff137f122b 的 apply_patch 已由 loopback 接收，日志明确标 transport=loopback_test。随后 session 01a09f42-8fcc-7612-bbaa-0b17b01d3e78 通过生产地址发送，三次受限重试均在建连阶段 ECONNRESET；队列已结束且 worker 正常退出，没有记录 accepted。

## 生产接收补验与 Mihomo 根因（17:40–17:48 北京时间）

系统 DNS 使用 Mihomo fake-IP，mcs.zijieapi.com 返回 198.18.0.13。规则文件的 reject 集包含 +.mcs.zijieapi.com，RULE-SET,reject,REJECT 排在直连规则之前。Mihomo journal 明确记录：mcs.zijieapi.com:443 match RuleSet(reject) using REJECT。

对照实验保留 https://mcs.zijieapi.com/v1/list、TLS SNI 和证书校验：普通请求、只设置 no-proxy、只固定真实 CDN IP 仍 reset；使用指定 DNS 解析真实地址，再绑定 eth0，两个 CDN 地址均返回 HTTP 200、e=0、证书校验通过。未停用、重启或修改 Mihomo，未改 hosts、系统 DNS 或全局路由。

真实 CLI 补验使用独立仓库副本和运行根；Git origin 为 git@code.byted.org:ide/traex-bd-plugins.git，用户字段 yuyuelun，模型 GPT-5.4，app_id 711126。安装的插件可执行文件及 SDK bundle 与实现提交 64e797e 一致。仅以测试进程 NODE_OPTIONS preload 对 MCS 请求设置 DNS lookup 和物理网卡源地址；正式插件没有增加硬编码 IP、自动绕过代理或关闭证书校验的逻辑。preload 同时记录请求摘要和实际响应，不修改请求正文或响应。

| 场景 | 生产结果 | session |
| --- | --- | --- |
| apply_patch 修改 | 1 条接收 | 01a09f4e-ae28-7180-926b-627531bccb14 |
| shell、Python 间接写、写后 exit 7 | 3 条接收 | 01a09f4f-070f-7b63-be2b-a977e0534bd7 |
| apply_patch 新增 | 1 条接收 | 01a09f4f-da71-78b3-93f3-3f98d67bb017 |
| 两个重叠 exec | 2 条接收，各一次 | 01a09f50-0437-7f40-82a7-e0f7b18b3f41 |
| detached worktree | 1 条接收 | 01a09f50-37b3-7572-aa76-eed6761a31ca |
| 只读、纯删除、文档 | 0 条，符合预期 | 01a09f50-677c-7203-9f20-fa56a6ac80f2 |

8 个请求全部 HTTP 200，正文均为 {"e":0,"sc":1,"tc":1}，TLS authorized=true；已逐条核对代码 SHA256、用户、模型、git_url、session/message。首条 requestId 为 20260914174542A528ADEA6594482F1A50，worktree 为 20260914174715044D9CB6791502AC89FE。并发场景两个 started 均先于任一 completed。测试后 outbox 为空，worker slot 已释放。

第一次 patch prompt 要求单次调用同时修改和新增，受测 CLI 只修改了一个文件；新增随后单独执行并验证。只将实际发生且已核对的 8 条事件计入通过项。

复现材料保存在隔离 E2E 工作区：mcs-direct-preload.cjs、production_direct.py、production_direct_matrix.py、artifacts/mcs-direct-wire.jsonl、production-direct-summary.json、production-direct-matrix.json、mihomo-reject-evidence.log。网络绕过脚本仅为该测试机使用，不随插件发布。

## 检查 skill 与只读诊断

恢复 check-hook-reporting 并在 manifest 声明 skills，按当前 0.3.0 的采集、入队、投递、看板证据重写；同时更新 traex-guide 0.1.44 的 FAQ 和路由。移除旧版运行目录、运行时 npm 安装和 turn_git_diff 检查方式，补充日志轮转、unknown、缓存上限、暂停及 Mihomo/TUN 诊断。

诊断脚本测试覆盖：生产/loopback/dry-run 分离、批次重试去重、相互矛盾终态、缺 count、跨轮转文件及 session/turn 关联、带时区筛选、旧 ok、不完整 JSON/控制文件、异常字段、软链/缺目录、单文件/记录/输出上限、无会话 GC/worker 错误。测试拦截写入 API 并校验文件内容与 mtime/ctime，证明诊断不写运行数据，也不读取 outbox/快照正文。

对既有真实日志执行新脚本：生产全集 8 批/8 事件；并发会话 2 批/2 事件；ECONNRESET 会话 1 批/1 事件、3 次尝试且没有生产确认；负例会话 0 批。检查前后日志/控制文件大小、mtime、SHA256 不变。脚本输出始终注明 retained_logs_only 和最终看板未验证。

Skill frontmatter 校验通过；隔离 TraeX 本地安装后 plugin validate 识别 ai-contribution 的 1 个 skill、5 个 hooks，以及 traex-guide 的 1 个 skill。自动回归已加入第十一组诊断测试。

真实 TraeX 使用已安装 skill，只给成功与失败的 runtime/session，不提供预期答案或旧验证报告。首轮虽诊断正确，但额外扫描目录/读取状态；据此强化有界读取与停止规则，再次验证。测试只读既有业务证据，执行器使用另一个运行目录并暂停采集，不新发生产事件。最终 session 01a09f62-ab82-7521-8db7-3e9bc013be51 正确识别 2 个生产接收批次和 1 个重试 3 次失败的批次；仅对两个 runtime 调用诊断脚本，未再递归扫描、读取原始日志或状态，证据文件保持不变。过程与结果保存在隔离 E2E 工作区的 skill-forward 系列材料。

## MR 评审修复验证（18:18–18:24 北京时间）

两条 P1 已复现并修复：transition owner 临时文件遗留会让拿锁持续超时；快照数量提前计入文档/生成文件会误跳过代码。新增测试分别加载修复前的实现，都以预期断言失败；修复后完整十二组 npm test 通过。

锁恢复测试覆盖真实子进程在 owner rename 前退出、部分写入后退出、根锁/turn 锁恢复、活跃未发布 owner、未知/poison/软链/retired 哨兵保留、目录代际替换，以及两个恢复者互斥。仅清受控 owner 临时文件；不采纳直接清 poison 临时文件的建议，因为它可能是尚未发布完整的故障哨兵。

快照先做 shouldReportPath 过滤，再对可上报路径检查 5,000 文件上限；Git 列表的 64 MiB 输出和 10 秒时限保持不变。测试验证超过额度的文档与 dist 文件不会影响单个代码文件采集，同时真正超过可上报文件额度仍会跳过。

真实 TraeX 使用 5,111 个 tracked 文件的独立 Git 仓库（5,100 文档、10 dist 文件、1 个代码文件），并在启动前通过子进程真实崩溃留下 .storage.lock.transition/.owner-*.tmp。session 01a09f70-c797-76e0-ada0-41ed7034cc24 成功恢复锁；Python 间接写触发整仓 paths=["."] 快照，fileCount=1，实际贡献 1 条，生产 HTTP 200 / e=0 / sc=1 / tc=1，TLS 校验成功，requestId=20260914182249BA02CABAE4508C02989E。代码 SHA256（含真实换行）、用户、模型和 Git remote 已核对；结束后队列为空，worker 退出。网络仍仅用测试进程直连。

首次 fixture 错用了 .storage.json 而非实际 .storage，因运行根白名单拒绝而无上报，未计入通过项；修正 fixture 后复测成功。最后哈希断言最初漏算行尾换行，已按实际文件字节核对原请求摘要并修正测试 oracle，没有重发请求。证据保存在 review-baseline-regressions.json、review-fixes-regression-tests.log 和 review-fixes-e2e-v2-summary.json。

## 合入/发布前的剩余验证与限制

1. 生产接收和真实用户/Git remote 字段已核对；下游最终提交归因/看板尚未核验。测试代码没有推送为生产提交，不能声称贡献率看板已计入。看板延迟与灰度验收应独立记录。
2. Windows/macOS、24–48 小时持续观察及 0.2.1/显式安装 0.2.3 的完整升级还未在真实客户端执行。0.2.2 清理共存已实测；旧白名单逻辑有自动测试。
3. GC 会在容量上限内读取所有状态以构建一致引用视图，删除分批进行。正常 hook 不全盘扫描，但暂未实现分代增量 mark-sweep。损坏状态时保守停止 GC，由硬限阻止继续增长。
4. 本机全局 Mihomo 规则保持原样；正常客户端上报需允许 mcs.zijieapi.com。如果使用同类广告过滤，应由使用者在 REJECT 规则之前添加该域名的 DIRECT 例外。插件不会擅自更改网络策略。

本地真实生产接收验证完成后提交 MR；保留人工 review、最终归因核验和灰度观察环节。
