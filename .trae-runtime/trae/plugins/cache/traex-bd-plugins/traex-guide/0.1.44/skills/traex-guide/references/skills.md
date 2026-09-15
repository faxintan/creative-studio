# 技能（Skills）

## 查看和使用

- `/skills`：查看当前对模型可见的 skills。
- Skills 可能来自用户资源、项目资源或插件。
- `SKILL.md` 是 skill 入口，旁边可以有参考文件或 scripts。

## 常见位置

```text
$TRAE_HOME/skills/<skill>/SKILL.md
<workspace>/.trae/skills/<skill>/SKILL.md
$TRAECLI_HOME/plugins/cache/<marketplace>/<plugin>/<version>/skills/<skill>/SKILL.md
```

## 配置

禁用或重新启用单个 skill 使用 `[[skills.config]]` 数组项。selector 二选一：
`path` 指向具体 `SKILL.md`，或 `name` 匹配 skill frontmatter 里的 `name`。

```toml
[[skills.config]]
path = "/absolute/path/to/skills/my-skill/SKILL.md"
enabled = false

[[skills.config]]
name = "github:yeet"
enabled = false
```

不要使用旧的 `[skills."<path>"] enabled = false` 写法；当前配置 schema 不按这个格式
解析。重新启用时可以把对应 `[[skills.config]]` 条目删掉，或写同一 selector 且
`enabled = true` 的更高优先级配置覆盖。

自定义 agent 的 Markdown frontmatter 也支持 `skills:`，它会在该 sub-agent 的
role 配置层中按名称重新启用 skill。要实现“主 agent 看不到、指定 sub-agent
可见”，先在 `$TRAE_HOME/traecli.toml` 用 `[[skills.config]]` 禁用，再在目标
agent 的 `skills:` 中重新启用。skill 仍放在共享的 `skills/` 目录，不存在
sub-agent 私有 skill 目录；完整示例见 `references/subagents.md` 的“Skills
可见性和‘专属 skill’”。

禁用内置 bundled skills：

```toml
[skills.bundled]
enabled = false
```

## 常见问题

`Skipped loading N skill(s) due to invalid SKILL.md files.` 表示有 skill 入口解析失败。按输出路径检查 `SKILL.md` 元数据或格式。
