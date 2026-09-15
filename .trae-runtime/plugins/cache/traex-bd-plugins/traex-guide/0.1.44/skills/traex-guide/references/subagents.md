# 子 Agent（Subagents）

## 查看入口

- `/agents`：查看可创建的 agent roles，包括内置和自定义 agents。
- `/agent-new`：创建新的自定义 agent 定义。
- `/subagents`：查看当前已启动的 agent threads。
- `Alt+Left` / `Alt+Right`：在多智能体线程中切换上一个 / 下一个。

`@` / `/mention` 用来引用文件，不会直接启动或切换到某个自定义 agent。自定义
agent 是供主 agent 委派任务时选择的 role：主 agent 会根据 agent 的
`description` 判断何时使用；用户也可以明确说“把这项任务交给 `<name>` agent”。
`/agent` / `/subagents` 只用于查看或切换已经启动的 agent thread。

## 配置

TraeX 兼容两类自定义 agent 定义：

- Markdown agent：放在 `~/.trae/agents/<name>.md` 或 `<repo>/.trae/agents/<name>.md`。
  这是 Claude Code 风格；通常不需要在 `traecli.toml` 里额外声明。
- TOML agent：通过 `[agents.<name>]` 加 `config_file = "...toml"` 声明。这是 Codex
  风格；`config_file` 指向的文件应是 TOML。

推荐先用 `/agent-new` 创建 Markdown agent。也可以手动创建：

```markdown
---
name: reviewer
description: 需要专项代码审查时由主 agent 委派
skills:
  - review-checklist
---

你是专项代码审查 agent。检查正确性、回归风险和缺失测试。
```

项目级文件放在 `<repo>/.trae/agents/reviewer.md`；用户级文件放在
`~/.trae/agents/reviewer.md`。新建或修改 agent 定义后，打开新会话让配置生效；用
`/agents` 检查 role 是否已被发现。

不要把 Markdown agent 文件路径写进 `[agents.<name>].config_file`。如果看到
`failed to parse agent role file ... TOML parse error at line 1, column 4` 且文件以
`---` 开头，通常是把 Markdown agent 当 TOML 加载了；删除 `traecli.toml` 里的对应
`[agents.<name>]` 配置，保留 `.trae/agents/<name>.md` 即可。

```toml
[features.multi_agent_v2]
enabled = true
max_concurrent_threads_per_session = 7

[agents]
max_depth = 5
job_max_runtime_seconds = 1800

[agents.researcher]
description = "研究型智能体"
config_file = "./agents/researcher.toml"
isolation = "worktree"
```

用 `features.multi_agent_v2.max_concurrent_threads_per_session` 控制 subagents
并发数。用户不需要区分具体模型或内部 multi-agent 版本。

自定义 agent 默认跟随主 agent 当前模型和 harness；除非后续版本提供单独配置，不要承诺
Markdown agent 可以独立选择 codex / claudecode harness。

`max_concurrent_threads_per_session` 表示同一个 session 里最多同时打开的线程总数，
包含主线程；例如设为 `7` 时，大约还能并发 6 个 subagents。

不要再用 `agents.max_threads` 控制并发；如果同时设置，启动会报
`agents.max_threads cannot be set when multi_agent_v2 is enabled`。遇到这个报错时，
删除 `[agents]` 下的 `max_threads`，保留 `max_depth`、
`job_max_runtime_seconds` 等不冲突配置。

`Unknown isolation value "..."; only "worktree" is supported.` 表示自定义 agent isolation 只支持 `worktree`。

## Skills 可见性和“专属 skill”

skill 没有 sub-agent 私有目录。项目级 skill 仍放在
`<repo>/.trae/skills/<skill-name>/SKILL.md`，用户级 skill 放在
`$TRAE_HOME/skills/<skill-name>/SKILL.md`；未设置 `TRAE_HOME` 时通常就是
`~/.trae/skills/<skill-name>/SKILL.md`。

默认启用的 skill 会被主 agent 和 subagents 一起发现。Markdown agent
frontmatter 的 `skills:` 会在该 role 的配置层中按名称启用对应 skill，但不会：

- 创建独立的 sub-agent skill root；
- 自动禁用该 sub-agent 的其它 skills；
- 在 sub-agent 启动时自动执行 skill。

如果要让主 agent 看不到某个 skill、只让指定 sub-agent 看见，使用“共享发现 +
主配置禁用 + role 重新启用”：

```text
repo/
  .trae/
    agents/
      reviewer.md
    skills/
      review-checklist/
        SKILL.md

$TRAE_HOME/
  traecli.toml
```

先在 `$TRAE_HOME/traecli.toml` 中禁用该 skill：

```toml
[[skills.config]]
name = "review-checklist"
enabled = false
```

再在 `<repo>/.trae/agents/reviewer.md` 中只为目标 role 重新启用：

```markdown
---
name: reviewer
description: 需要专项代码审查时由主 agent 委派
skills:
  - review-checklist
---

你是专项代码审查 agent。
```

skill 名称来自 `SKILL.md` frontmatter 的 `name`，应保持唯一、完全匹配。这里不需要
设置 `[skills.bundled] enabled = false`；那会关闭全部 bundled skills，不是实现
sub-agent 专属可见性的必要条件。修改配置后打开新会话，用 `/skills` 分别检查主
agent 和目标 sub-agent 的可见列表。
