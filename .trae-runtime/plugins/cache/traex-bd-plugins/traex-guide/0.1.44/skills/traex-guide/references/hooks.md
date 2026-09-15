# 生命周期钩子（Hooks）

回答 TraeX hooks 问题时，先把“配置文件能解析”和“hook 运行时会触发”分开讲。
`/hooks` 是当前会话里最直接的核验入口：它会展示已发现的 hook、source、事件、matcher、
命令、启用状态和信任/审查状态。

## 体系关系：一个用户入口，多层兼容实现

不要把 TraeX hooks 说成 Coco hooks 和 Codex hooks 两套并列 API，让用户二选一。
面向用户的入口统一是 `hooks.json` / `traecli.toml` 的 `[hooks]`，再由运行时把兼容格式、
插件 hooks 和策略下发的 managed hooks 汇总到 `/hooks` 里。

内部可以按这几层理解：

- 当前 command hook 运行时：执行 `type:"command"` 的 hooks，支持本文列出的 13 个事件、
  matcher、stdin payload 和 stdout 输出协议。
- Coco / Claude 兼容层：兼容 `hooks.json` 顶层 `hooks` 对象、事件名 PascalCase /
  snake_case / camelCase、Go-style duration、旧资源目录，以及 `event_type`、嵌套
  `pre_tool_use` / `post_tool_use` / `user_prompt_submit` 等 payload 字段和 exit code 2 语义。
- TraeX / Codex 扩展层：补充 `PermissionRequest`、`PostToolUseFailure`、subagent / compact
  事件、`turn_id`、`thread_name`、信任/审查状态、插件环境变量、managed hooks 等能力。
- legacy notify：这是单独的旧通知兼容路径，会在 agent 回合完成后触发 `AfterAgent` 风格通知；
  它不通过 `hooks.json` 配置，也不应作为当前 hooks 配置示例来推荐。只有排查旧通知集成时才提。

所以回答“我们 hooks 是不是有好几套”时，推荐说：用户配置面是一套；实现上有 Coco/Claude
兼容、TraeX/Codex 扩展和 legacy notify 兼容路径。除非用户明确在排查旧 notify，否则都按
本文的统一 hooks surface 来解释。

对外讲参数时也按这个原则：

- 新写 hook：只推荐当前字段和当前输出协议，例如 `hook_event_name`、`tool_name`、
  `tool_input`、`prompt`、`hookSpecificOutput`、`permissionDecision`。
- 老脚本兼容：可以说明 raw stdin/stdout 里可能同时出现 `event_type`、嵌套的
  `pre_tool_use` / `post_tool_use` / `user_prompt_submit`、`decision:"block"` 或 exit code 2
  这类兼容字段/语义。
- 不要把这些兼容字段包装成另一套“推荐参数表”。它们的价值是让旧集成继续工作、帮助排查
  为什么某个旧 hook 还能触发。

## 放在哪里

常见入口：

- 用户级：`$TRAECLI_HOME/hooks.json`。旧的 `$TRAE_HOME/hooks.json` 迁移后不再读取，
  看到迁移 warning 时把文件复制到 `$TRAECLI_HOME/hooks.json`。
- 项目级：`<workspace>/.trae/hooks.json`。项目目录未被信任时，项目级配置和 hooks 不会生效。
- 项目兼容资源目录：当前项目被信任时，也可能从配置的 resource dirs 下读取
  `<workspace>/<resource-dir>/hooks.json`，常见是 `.coco/hooks.json`、`.agents/hooks.json`、
  `.codex/hooks.json`、`.trae/hooks.json`；以 `/hooks` 展示为准。
- 插件级：默认 `hooks/hooks.json`；插件也可以在 `.codex-plugin/plugin.json` 里声明
  `"hooks": "./hooks.json"` 或其它路径。插件必须安装且启用，插件 hooks 才会进入运行时。
- 内部 managed hooks / 云端 requirements：可能显示为 managed、system、MDM 或 cloud source；
  这类通常由策略下发，用户不能靠编辑项目文件修改。

插件 hook 命令里：

- `__PLUGIN_DIR__` 会替换成“当前 hooks 文件所在目录”。如果文件是 `hooks/hooks.json`，
  它就是 `<plugin-root>/hooks`，不是插件根目录。
- 插件管理器加载的 hooks 还会提供 `${PLUGIN_ROOT}` / `${CLAUDE_PLUGIN_ROOT}` 和
  `${PLUGIN_DATA}` / `${CLAUDE_PLUGIN_DATA}` 环境变量，并会对命令里的 `${PLUGIN_ROOT}`、
  `${PLUGIN_DATA}` 做替换。写插件脚本时优先用 `${PLUGIN_ROOT}/scripts/xxx.sh`。

## hooks.json 形状

`hooks.json` 必须有顶层 `hooks` 对象。事件名建议用 PascalCase；运行时也兼容
snake_case 和 camelCase，但同一个逻辑事件不能重复出现。

```json
{
  "description": "Project hooks",
  "version": "1",
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|apply_patch",
        "hooks": [
          {
            "type": "command",
            "command": "sh .trae/hooks/pre_tool_use.sh",
            "timeout": "30s",
            "statusMessage": "checking command"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "sh .trae/hooks/stop.sh",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

不要把 handler 写成简化的顶层 `command` 字段；正确结构始终是：事件 → matcher group 数组 →
嵌套 `hooks` handler 数组。

## traecli.toml 形状

在 `traecli.toml` 里，hook 事件放在 `[hooks]` 配置域下：

```toml
[[hooks.PreToolUse]]
matcher = "Bash|apply_patch"

[[hooks.PreToolUse.hooks]]
type = "command"
command = "sh .trae/hooks/pre_tool_use.sh"
timeout = 30
statusMessage = "checking command"
```

解析层也支持事件名的 snake_case / camelCase 别名，例如 `pre_tool_use` 或 `preToolUse`；
文档和示例里仍优先写 `PreToolUse`。

## handler 字段

当前可真正执行的 handler 只有：

```json
{
  "type": "command",
  "command": "python3 .trae/hooks/hook.py",
  "timeout": 30,
  "async": false,
  "statusMessage": "running hook"
}
```

字段说明：

- `type`: 目前只推荐 `command`。配置解析器能识别 `prompt` 和 `agent`，但运行时会跳过并给 warning：
  `prompt hooks are not supported yet` / `agent hooks are not supported yet`。
- `command`: 交给系统 shell 执行；stdin 是 JSON payload，stdout 可返回 hook JSON 输出。
- `timeout`: 可写整数秒、`"30s"`、`"2m"`、`"500ms"`、`"1h30m"`、`"unlimited"` 或 `null`。
  省略默认 600 秒；非 0 超时会最小归一到 1 秒。
- `async`: 除 `PermissionRequest` 外的事件支持异步执行。异步 hook 适合日志/遥测，不适合返回
  block/allow/deny 这类决策，因为运行时会立即继续。
- `statusMessage` / `status_message`: hook 运行时展示的状态文案。

## matcher 规则

`matcher` 用来筛选某类触发源：工具名、通知类型、subagent 类型、compact trigger、
session start source 等。

- 省略 matcher、空字符串 `""`、或 `"*"` 都表示匹配全部。
- 简单字符串支持精确匹配和 `|` 多选，例如 `Bash|apply_patch`。
- 也支持正则，例如 `^Bash$`、`Edit|Write`；非法正则会导致该 matcher group 被跳过。
- `SessionEnd`、`UserPromptSubmit`、`Stop` 会忽略 matcher；给这些事件写 matcher 没有筛选效果。

有 matcher 的事件：`PreToolUse`、`PermissionRequest`、`PostToolUse`、`PostToolUseFailure`、
`Notification`、`SubagentStart`、`SubagentStop`、`PreCompact`、`PostCompact`、`SessionStart`。

## 当前支持的事件

| 事件 | 什么时候触发 | matcher 输入 | 备注 |
| --- | --- | --- | --- |
| `PreToolUse` | 工具调用执行前 | 工具名和兼容别名，如 `Bash`、`apply_patch` | 可阻止工具调用，也可给本次 tool use 设置 allow/ask。 |
| `PermissionRequest` | 即将弹出权限审批前 | 工具名和兼容别名 | 可直接 allow/deny 审批；该事件即使配置 `async: true` 也会同步运行。 |
| `PostToolUse` | 工具成功返回后 | 工具名和兼容别名 | 可追加上下文、反馈或停止后续处理。 |
| `PostToolUseFailure` | 工具失败返回后 | 工具名和兼容别名 | stdin 包含 `error` 字段；输出协议复用 PostToolUse。 |
| `Notification` | TraeX 发送运行时通知时 | `notification_type`，例如 `idle_prompt`、`permission_prompt` | stdin 包含 `notification_type`、`title`、`message`。 |
| `SubagentStart` | subagent 启动时 | `agent_type`，例如 `review`、`general-purpose` | stdin 可能包含 `agent_id`、`agent_type`。 |
| `SubagentStop` | subagent 结束时 | `agent_type` | 兼容 payload 里还会带 `event_type: subagent_stop` 和 `subagent_stop.subagent_name`。 |
| `PreCompact` | compact 发生前 | `manual` 或 `auto` | `continue:false` 可停止当前 compact 流程。 |
| `PostCompact` | compact 结束后 | `manual` 或 `auto` | stdin 包含 `compact_summary`，可能为空。 |
| `SessionStart` | 会话启动、resume、clear 时 | `startup`、`resume`、`clear` | 可返回 additionalContext 注入模型上下文。 |
| `SessionEnd` | 会话结束时 | 忽略 matcher | stdin 包含 `reason`，常见值如 `prompt_input_exit`、`other`。 |
| `UserPromptSubmit` | 用户消息进入模型前 | 忽略 matcher | 可 block 用户输入或追加上下文。 |
| `Stop` | assistant 回合结束、准备停下时 | 忽略 matcher | 可要求模型继续；也支持 `continue:false` 停止后续处理。 |

`PreCompact` / `PostCompact` 目前不能像 Claude Code 那样直接返回“压缩前请关注这些内容”
或“压缩后请重新读取这些信息”的自定义 compact prompt。可用的折中方式是让 compact hook
记录本地标识，再由后续 `PreToolUse` / `UserPromptSubmit` hook 通过 `additionalContext`
把提示补给模型；回答用户时要明确这是绕行方案，不是 compact hook 的原生 prompt 注入能力。

## command stdin 通用字段

大多数 command hook 的 stdin 是一个 JSON 对象，常见字段包括：

```json
{
  "session_id": "...",
  "thread_name": "optional session name",
  "session_name": "same as thread_name",
  "agent_type": "present when running inside a subagent",
  "transcript_path": null,
  "cwd": "/path/to/workspace",
  "turn_id": "...",
  "hook_event_name": "PreToolUse",
  "model": "gpt-...",
  "permission_mode": "default"
}
```

不同事件会追加自己的字段：

- 工具类：`tool_name`、`tool_input`、`tool_use_id`；PostToolUse 成功时还有 `tool_response`，失败时有 `error`。
- UserPromptSubmit：`prompt`，以及 Coco 兼容的 `event_type` / `user_prompt_submit`。
- Compact：`trigger`，PostCompact 还有 `compact_summary`。
- Notification：`notification_type`、`title`、`message`。
- Subagent：`agent_id`、`agent_type`。
- SessionStart：`source`。
- SessionEnd：`reason`。
- Stop：`stop_hook_active`、`last_assistant_message`。

## stdout 输出协议

stdout 为空表示 hook 成功但不做额外动作。stdout 如果看起来像 JSON，必须是合法对象；非法 JSON
会把该 hook 标记为 failed。

通用输出字段：

```json
{
  "continue": true,
  "stopReason": "optional reason when continue is false",
  "suppressOutput": false,
  "systemMessage": "optional warning shown in hook output",
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "text injected into model context"
  }
}
```

注意：`suppressOutput: true` 只隐藏可见 hook 输出；`additionalContext` 仍会进入模型上下文。

常用决策输出：

### 阻止工具执行：PreToolUse

推荐使用 `hookSpecificOutput.permissionDecision`：

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Do not run destructive commands"
  }
}
```

也可以返回 legacy block：

```json
{"decision":"block","reason":"Do not run this command"}
```

`permissionDecision` 支持 `allow`、`ask`、`deny`；`deny` 必须有非空
`permissionDecisionReason`。`updatedInput` 目前不支持，会 fail closed。`decision:"approve"`
目前不支持，不要使用。

### 自动处理审批：PermissionRequest

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PermissionRequest",
    "decision": {
      "behavior": "deny",
      "message": "Network command is not allowed in this repo"
    },
    "additionalContext": "Mention this denial in the next assistant message."
  }
}
```

`behavior` 支持 `allow` 和 `deny`。`updatedInput`、`updatedPermissions` 是保留字段，当前不支持，
出现时会 fail closed。`continue:false` 和 `stopReason` 对 PermissionRequest 也不支持。

### 工具后、用户输入和 Stop 的 block

`PostToolUse`、`PostToolUseFailure`、`UserPromptSubmit`、`Stop` 可用：

```json
{"decision":"block","reason":"Please revise before continuing"}
```

`decision:block` 必须带非空 `reason`。

Stop 还兼容 Claude/Coco 风格：hook 退出码为 2 且 stderr 有文本时，会把 stderr 当作
continuation prompt，让模型再跑一轮。没有 stderr 的 exit 2 会视为失败。

### 退出码兼容

优先让 hook 输出 JSON；exit code 兼容只用于旧脚本：

- `PreToolUse`: exit 2 + stderr 文本会阻止工具调用，并把 stderr 当作 block reason。
- `UserPromptSubmit`: exit 2 + stderr 文本会阻止这条用户输入。
- `PostToolUse` / `PostToolUseFailure`: exit 2 + stderr 文本会作为反馈提供给模型，但不等同于
  JSON `decision:block`。
- `Stop`: exit 2 + stderr 文本会作为 continuation prompt，让模型继续一轮。
- 其它非零退出码通常把该 hook 标记为 failed。

`SessionStart` 还有兼容行为：非 JSON 的普通 stdout 会作为模型上下文；其它事件不要依赖普通
stdout，尽量返回上面的 JSON 对象。

### Stop 的 stdout async ack

`Stop` 同步 hook 如果第一段 stdout 是 `{"async":true,"asyncTimeout":1000}`，运行时会把后续等待
放到后台处理。这只适合后台清理/遥测，不适合返回 block/continue 决策。

## 最小可跑脚本

`.trae/hooks/pre_tool_use.sh`：

```sh
#!/usr/bin/env sh
set -eu
payload="$(cat)"
printf '%s\n' "$payload" >> .trae/hooks/pre_tool_use.log.jsonl
case "$payload" in
  *'"command":"rm -rf /"'*)
    printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Refuse destructive command"}}'
    ;;
esac
```

对应 `.trae/hooks.json`：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "sh .trae/hooks/pre_tool_use.sh",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

写完后检查：

1. `chmod +x .trae/hooks/pre_tool_use.sh`（如果直接执行脚本而不是 `sh script.sh`）。
2. 重启或重新进入会话，打开 `/hooks`。
3. 确认事件、matcher、命令、source、enabled、trusted/review 状态正常。
4. 触发对应工具/事件后看 hook log、TraeX 日志和 hook run 输出。

## 排查顺序

1. `/hooks` 是否能看到这条 hook；看 source 是 user、project、plugin 还是 managed。
2. 项目目录是否已 trust；插件是否安装并启用。
3. 文件形状是否是 `hooks -> Event[] -> hooks[]`，事件名是否在上表。
4. matcher 是否匹配当前触发输入；不确定时先省略 matcher 或写 `"*"`。
5. handler 是否是 `type: command`；`prompt` / `agent` 目前会被跳过。
6. 非 managed hook 是否已通过 `/hooks` 信任/审查；untrusted 或 modified 的 hook 只展示不运行。
7. command 在当前 `cwd`、shell、PATH、env 下是否能跑；脚本是否可执行；timeout 是否太短。
8. stdout 是否为合法 JSON；决策字段是否受该事件支持。
9. 日志里是否有 parse error、invalid matcher、unsupported updatedInput、command failure、timeout、
   `prompt hooks are not supported yet` / `agent hooks are not supported yet` 等 warning。
