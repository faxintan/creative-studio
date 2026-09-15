# AI Contribution 0.3.1

恢复 TraeX 的 AI 代码变更上报，同时限制插件自己的运行数据。五个 hook 均同步捕获；网络请求与旧目录清理在后台单 worker 执行。安装包内携带锁定版本 SDK，用户运行时无需 npm、下载或依赖安装。

## 行为

- UserPromptSubmit 建轮次，PreToolUse 保留不可变前快照，PostToolUse / PostToolUseFailure 计算实际新增代码，Stop 恢复未闭合工具并压缩状态。
- apply_patch 优先解析 patch，Write/Edit/shell/exec 使用路径快照补充。Git worktree、仓库外 cwd 指向仓库内文件、宽范围小仓库快照均支持。
- 忽略 gitignore、文档、生成目录、二进制、超大文件、纯删除和非 Git 文件。缺失 Pre 时不根据后状态补报。无法解析路径的 shell 使用有上限的 cwd 仓库快照。
- SDK 生成完整 Tea envelope 后持久化到 outbox；后台读取真实 HTTP 响应。queued 表示入队；accepted 表示 HTTP 200 且 MCS JSON e: 0，不代表贡献率看板已经归因。测试地址仅允许 loopback HTTP，并在验证报告中单独列出。
- 仅连接建立前的失败重试，最多三次请求；连接建立后丢失响应、发送进程中断均记 delivery_unknown，不重放。队列发布前先持久化工具 claim，进程恰在两者之间崩溃可能丢一批，但不会重复上报。
- Hook 失败不阻断代码任务：默认共享 500 ms 前台预算（含等待/适配器/调度尾部），锁竞争最多等待 50 ms；外层 30 秒仅保留为宿主兜底，不是正常路径预算。一个运行根最多一个发送 worker，单次请求 8 秒，worker 生命周期最多 55 秒。

## 性能降级边界

- 保留 Bash 无精确路径时的仓库快照兜底；不是禁用 shell 采集。
- 快照 Git 列表使用增量 NUL 解析，先过滤再计可上报文件，第 5,001 个立即停止；另有 50,000 原始候选、4 MiB 列表输出和 250 ms 采样预算，防止大量文档或 Git 首字节等待绕过限制。超限终止并回收 Git，整个不完整快照丢弃，不拿前 5,000 个冒充完整快照。
- 超限 Pre 仍保存轻量 span 和 skip 原因；该范围的间接 Bash 修改可能不采集，其他 span 不受其 skip 状态污染。apply_patch 的 direct blocks 合并/去重逻辑不变；仍不允许缺失 Pre 时补报。
- 单 hook 的采样与 diff 共用快照截止时间；子进程受剩余前台预算约束。POSIX runner 超时先 TERM、40 ms 后 KILL 适配器进程组；Git helper 自身早停会等待 Git 退出。不承诺在操作系统停顿/不可中断磁盘 I/O 下提供硬实时保证。
- 适配器失败只写有界 stderr，不再为写诊断或启动 worker 重新等待故障锁。应同时查 TraeX hook stderr；diagnostics.jsonl 缺少这些失败记录不等于没有故障。成功后的 worker 调度最多等锁 20 ms，失败不丢弃已入队数据，后续 hook 可再次调度。

## 存储和回收

新目录为 ~/.trae/hooks/ai-contribution-v2，与 0.2.2 会删除的两个旧目录隔离。旧清理模块继续按原白名单处理 ai-contribution-sdk、ai-contribution，后台每小时最多尝试一次；共享 npm cache、其他插件、PluginStore 的安装版本不在清理范围。

| 数据 | 上限或处理 |
| --- | --- |
| 全部运行数据 | 默认 128 MiB 高水位、256 MiB 硬上限，包含原子写入副本，按至少 4 KiB 分配块保守计量 |
| 文件数量 | 默认 20,000，另预留固定控制文件空间；数据子目录固定且扁平 |
| 快照 | 单文件 2 MiB、单次 5,000 个可上报路径/64 MiB、单轮状态 4 MiB；路径过滤先于数量检查，完成工具立即释放快照引用 |
| 完成摘要 | 默认 7 天或 2,048 个；压力下优先清除旧摘要 |
| 待发送队列 | 32 MiB、24 小时；过期后删除，记录 queue_expired |
| 日志 | 3 类日志各 2 MiB + 1 个备份，单条至多 16 KiB；正常模式不记录代码正文 |
| GC | 每小时或达到高水/数量阈值触发；每批至多 256 个状态、1,024 个状态/blob；残留任务在后续 hook 继续推进 |

Git 枚举、源文件读取、diff 与 Stop 批量计算不持有根锁。状态/快照 blob 发布、claim、队列与 GC 使用短根锁事务，锁顺序仍是根锁再 turn 锁；活跃 claim 保护计算中的快照，独立临时文件保护并发 diff。Pre 在锁外采样、锁内重新核验轮次准入与重复事件后发布，避免 GC 淘汰与采样交错时重新打开旧轮次。网络期间不持有根锁。容量账本在事务前标 dirty，崩溃或写失败后重新盘点；正常 hook 不全量扫描。达到硬限后拒绝新增数据，worker 仍使用预留控制空间启动回收。损坏状态导致 GC 保守停止并记录错误，容量硬限继续生效；不要直接删活跃状态目录。

锁 owner 发布前崩溃留下的受控临时文件、遗留空 .reclaim 可在过期且无活跃 owner 时回收；新回收者先写入唯一 token owner，再原子发布非空 .reclaim 目录，回收者中断后可以继续恢复。回收前重新核对目录代际。poison（含未发布的 poison 临时文件）、未知内容、软链及未核实的退休代际继续阻止自动回收，避免把故障哨兵误当缓存删除。

删除去重摘要前先持久化 UUIDv7 时间下界；已存在的活跃轮次继续使用自身状态，晚于下界的新轮次可创建。无法排序的历史 turn ID 在发生摘要淘汰后不再接纳新建，以避免旧事件重新上报。当前 TraeX 使用 UUIDv7；自定义 hook 调用方应同样使用 UUIDv7。

目录根允许系统 home 和 /var 别名规范化，运行根和子路径的软链被拒绝。路径覆盖不能指向旧清理目录或共享 npm cache。所有数据文件为 0600，目录默认 0700。运行数据仅由插件写入；外部修改需让账本重新盘点。

## 检查上报

插件附带 check-hook-reporting skill，可直接要求 TraeX“检查这次 AI 代码修改有没有上报”。它按加载、采集、入队、生产接收、看板归因分层检查，并覆盖日志轮转、缓存上限和 Mihomo/TUN。可用 /skills 确认当前版本已加载。

也可在插件目录运行：

```bash
node skills/check-hook-reporting/scripts/inspect-reporting.cjs --session SESSION_ID --since 2026-09-14T17:00:00+08:00
```

可加 --log-dir 指定运行目录、--turn 定位轮次。脚本只读有界日志和元数据，不读队列/快照代码、不执行清理或发请求。汇总按 batchId 去重，区分生产 accepted、loopback、dry-run、unknown 与失败；缺日志不等于没发生。详细边界见 [检查指引](skills/check-hook-reporting/SKILL.md)。

## 开关与验证

- AI_CONTRIBUTION_PAUSED=1 或运行目录中的 PAUSED 文件：暂停新增采集/投递，仍允许清理。删除文件后恢复。
- AI_CONTRIBUTION_LOG_DIR：隔离运行目录。设置后不会调用默认 home 的旧目录清理；因此升级清理测试应同时给旧 hook 配置独立 OS home。
- AI_CONTRIBUTION_SDK_DRY_RUN=1：验证 SDK 事件而不入发送队列，测试日志包含测试代码参数。
- AI_CONTRIBUTION_NO_WORKER=1：集成测试用，保留入队数据，不启动后台 worker。
- AI_CONTRIBUTION_TEST_ENDPOINT=http://127.0.0.1:PORT/...：loopback 接收/故障测试。
- AI_CONTRIBUTION_HOOK_BUDGET_MS：前台共享预算，默认 500 ms，最大 25,000 ms；用于诊断/压力测试可显式调大，不建议以增加预算代替修复。
- AI_CONTRIBUTION_SNAPSHOT_BUDGET_MS / AI_CONTRIBUTION_SNAPSHOT_LIST_BYTES / AI_CONTRIBUTION_SNAPSHOT_CANDIDATE_LIMIT：默认 250 ms / 4 MiB / 50,000，仅允许降低。容量及快照环境变量的非法数值回退默认值。
- AI_CONTRIBUTION_HOOK_DEADLINE_MS 是 runner 传给子进程的内部单调时钟截止值，请勿手工持久化配置。

构建：npm ci --ignore-scripts --registry=https://bnpm.byted.org，然后 npm run build、npm test。

SDK 固定 @ai-server/contribution-sdk@3.0.1-alpha.101、@dp/tea-sdk-node@3.0.10，esbuild 固定 0.25.9。vendor/reporter.cjs 为提交的构建产物；更新依赖必须同时更新 lockfile、bundle 和测试。完整回归包含路径、事务并发、claim/PID/锁故障、生命周期、队列、单 worker、暂停和 10,000 轮容量负载。本次性能修复的 13 组回归和真实 TraeX 验证见 [VALIDATION-0.3.1.md](VALIDATION-0.3.1.md)；0.3.0 的历史生产接收边界保留于 VALIDATION.md。正确性压力组显式使用 25 秒预算，新增性能组强制使用默认 500 ms，避免把宽松压力测试误当性能验收。

发布前需确认生产 MCS 接收以及真实仓库提交归因。旧 !114 为完全下线方向，不应与本恢复改动同时合入。默认安装策略沿用 marketplace 当前配置；禁用或关闭更新的客户端不自动恢复。

若 reports.jsonl 持续记录建连阶段 ECONNRESET，需同时检查本机代理/TUN 日志。部分广告过滤规则会将 mcs.zijieapi.com 归为 REJECT；设置 NO_PROXY 并不能绕过 TUN。确认命中该规则后，可由使用者按自身网络策略在 REJECT 之前配置 DOMAIN,mcs.zijieapi.com,DIRECT 例外。不要将 DNS 返回的某个 CDN IP 固化到插件，也不要关闭 TLS 证书校验。该次测试采用进程级直连，未实际修改全局规则；根因、请求 ID 与验收边界见 VALIDATION.md。
