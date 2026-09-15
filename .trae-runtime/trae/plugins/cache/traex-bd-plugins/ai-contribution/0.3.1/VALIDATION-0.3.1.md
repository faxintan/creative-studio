# 0.3.1 性能与锁恢复验证（2026-09-15）

## 范围与基线

- 插件仓库 `ide/traex-bd-plugins`，基于 `main / 7a9be76`，分支 `fix/ai-contribution-hook-budget-20260915`。不是 TraeX 核心仓库 develop。
- 保留 apply_patch direct blocks 与 Bash 路径/仓库快照；修复有界提前终止、回收者中断与前台超时放大。不改变缺失 Pre 不补报、claim 与 at-most-once 边界。
- Linux、Node v22.23.2、Git 2.39.5、真实 traecli 0.205.1 internal edition；CLI 默认模型 GPT-5.4。
- 独立 worktree、TRAE_HOME、TRAECLI_HOME、运行根和 Git fixture。未覆盖常用 TraeX 安装、未修改全局网络或运行数据。
- SDK 依赖与 vendor bundle 不变；`npm ci --ignore-scripts --registry=https://bnpm.byted.org`、`npm run build` 完成。bundle SHA256 仍为 `02f0332c407224256a6f430e59bf418fdb89cf7eaa6d826840aa5809d2d390dc`。

## 根因校正

旧版同步 `git ls-files` 完整缓冲输出，随后才检查 5,000 个可上报文件。28.9 万候选文件仓库可在检查前耗尽 10 秒 Git timeout；源文件读取和 diff 又处于全局存储锁内，放大其他 hook 的等待。

另一条独立、可复现的慢路径是 ownerless `.storage.lock.transition/.reclaim`：回收者自己退出后，后来的回收者无法创建同名空目录。旧实现隔离复现实测：直接 adapter 10.062 秒、禁用 worker 的 runner 15.130 秒、完整 runner 25.129 秒。它是业务锁、错误日志、调度和二次错误日志反复等待的叠加，**不应把所有 25 秒都解释为 adapter 被 25 秒 watchdog 杀死**。真实材料还另有 adapter timeout；不能仅凭缺 turn/session 的 7 条错误断言它们属于同一个 turn。

## 修复边界

1. 增量解析 Git 的 NUL 文件列表：过滤、去重后第 5,001 个可上报文件即结束；同时限制原始候选 50,000、原始列表 4 MiB。首字节等不到也受时间预算约束。停止后 kill/reap Git，失败不返回部分路径。
2. 采样/diff 共用默认 250 ms 截止时间；runner 默认总预算 500 ms，给退出和调度留余量。前台业务锁最多等 50 ms，成功后的 worker 调度最多等 20 ms；适配器失败不再为日志和调度重试故障锁，改用有界完整 JSON stderr。
3. 新 `.reclaim` 在唯一候选目录中写完 token owner 后，原子发布非空目录。只回收死亡 owner 或过期旧空 marker；保留活跃 owner、poison/未知内容/软链/未核实退休代际。退役整个旧 transition 后再清 marker，避免在公共路径留下清理窗口。
4. 枚举、源文件读取和 diff 在根锁外；不可变 blob+span 发布仍在短事务内，claim 保护在用引用。临时 diff 文件按进程与随机 token 隔离，GC 不删活跃计算的 scratch。Pre 发布事务重新核验准入，避免锁外计算期间 GC 推进水位导致旧轮次复活。

## 自动回归

`npm test` 共 13 组：原有 12 组正确性/资源/传输测试，加 `hook_performance_test.cjs`。原正确性压力组显式采用 25 秒预算，尤其用于 24 进程与故障注入；**性能组强制 500 ms**，不是以调大预算使性能测试通过。

新增/扩充验证包含：

- 五类 hook 在 poison gate 下快速 fail-open、无再次调度、故障哨兵保持不变；实际旧空 .reclaim 恢复后建立轮次。
- 真正子进程在 owner 发布、回收 claim 发布、候选 owner 部分写入和 transition 退役后退出；恢复者再次进入，两名恢复者互斥，live/替换代际与旧安全哨兵保留。
- 文件过滤/重复项、跨 chunk UTF-8/NUL、文件名换行、候选/输出/时间上限及 Git 退出确认。
- 真正 300,000 条 tracked Git index（不声称创建 30 万实体源文件）：宽 Bash Pre 留下轻量 skip span，同仓库明确 apply_patch 仍产生代码事件。
- Git 枚举期间其他进程可进入根事务；GC 推进准入后旧 Pre 不得重新建轮次；活跃 diff scratch 在 GC 后仍存在。
- Linux 上 TERM-ignoring adapter 及后代被 runner 进程组升级终止，没有仍运行的后代。
- 原有失败工具/Stop 恢复、缺失 Pre、并发终态去重、claim/PID/锁替换、队列拒绝、真实 SDK/HTTP、单 worker、暂停/恢复和 10,000 轮有界容量负载继续回归。

专项测量（独立进程壁钟，含 Node 启动；不是线上 p95）：健康 hook 157 ms；五类 poison hook 163–172 ms；300k index Bash Pre 257 ms，明确 patch Post 302 ms。性能 gate 为每次低于 800 ms，容纳进程启动/退出与 CI 调度余量；不是宣称操作系统下的硬实时 500 ms 上界。

## 真实 TraeX 复测

本轮使用实际安装的 0.3.1 插件和 SDK，发送到本机 loopback HTTP 接收端，核对真实请求的代码（含换行）、文件、session/message、模型及测试用户。安装的 adapter、runner、锁、存储、worker、新 helper 和 bundle 字节均与 worktree 一致。

| 场景 | 真实接收事件数 | session |
| --- | ---: | --- |
| apply_patch 修改 | 1 | `01a0a453-2ea4-7ca1-abe7-4d48272ab1c4` |
| shell、Python 间接写、写后 exit 7 | 3 | `01a0a453-6c50-7f70-80b4-6dca886b78d8` |
| 只读、文档、ignored、dist | 0 | `01a0a453-b306-7db0-a902-173b4a5acd42` |
| 旧空 .reclaim 恢复后 apply_patch 新增 | 1 | `01a0a454-01a8-7c63-b32f-ebed1b5ac032` |
| 300k index：宽 Bash 跳过，明确 patch 成功 | 1 | `01a0a454-249c-7ad3-a7c6-7a33c9ca2690` |
| 两个真实重叠 exec，各一次 | 2 | `01a0a454-88a1-7f11-af47-0c3a82fc975e` |

总计 8 条事件均为 loopback HTTP 200 / e=0，精确代码和文件与 fixture 断言匹配。并发场景两个 `item.started` 都早于任何 `item.completed`，不是串行执行后仅核对数量；结束后 outbox 为空，worker slot 释放，六次调用没有 hook adapter/锁超时错误。

首轮真实矩阵通过后，最终复测增加精确代码断言和并行工具场景。最终复测的首次 oracle 将换行误写为两个字面字符，接收代码本身正确；修正 oracle 后重建独立 fixture 完整重跑，不以失败的断言计入通过结果。

本轮没有向生产 MCS 发送测试代码。loopback accepted 只证明真实采集、SDK、入队及发送链路，并不等价于生产接收或看板入桶；历史 0.3.0 生产验收另见 VALIDATION.md。

## 限制与灰度建议

- 超过快照预算时宁可跳过该范围的间接修改，不返回截断快照；若整条 Pre 因超时/锁失败未能持久化，后续仍按缺失 Pre 不补报。短预算会牺牲繁忙/慢盘机器上的采集覆盖，需灰度监控 skip 原因和正常 direct 成功率。
- 500 ms 是前台合作式预算加进程 watchdog，不保证不可中断磁盘 I/O、系统停顿下的硬实时。
- 本次未运行 macOS/Windows 客户端；特别是 Windows 目录 rename/进程树终止、跨平台 PID identity 要单独验证。未完成 24–48 小时生产灰度或下游归因验证。
- 不会自动清除 poison/未知故障哨兵；这类状态快速跳过后仍需人工诊断。
- `reports.jsonl`/`diagnostics.jsonl` 不能覆盖所有锁故障，须同时保留宿主 hook stderr。调度失败的队列等待后续 hook 重试，不新增常驻守护进程。
