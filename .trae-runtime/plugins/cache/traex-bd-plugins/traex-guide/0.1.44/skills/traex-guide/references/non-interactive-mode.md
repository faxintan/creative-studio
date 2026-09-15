# 非交互模式

## exec

非交互自动化常用 `exec` 参数包括 `--json`、`--output-last-message <file>` / `-o <file>`、`--output-schema <file>`、`--color <always|never|auto>`、`--skip-git-repo-check`、`--ephemeral`、`--ignore-user-config` 和 `--ignore-rules`。

示例：

```bash
traecli exec --json --sandbox workspace-write "运行测试并修复失败用例"
echo "总结这个仓库的架构" | traecli exec -o out.md
```

`--json` 输出的是面向调用方的 stdout JSONL 事件流，不是本地 session 目录里落盘 JSONL
的完整镜像。不要承诺它会包含所有内部记录；例如部分 subagent 细节可能只在 session
文件或 trace 中更完整。自动化只需要最终答复时，优先用 `-o <file>`。

`exec` 当前没有内置 query timeout 参数。脚本侧需要超时时，用系统 `timeout` 包一层，例如
`timeout 30m traecli exec "..."`；如果 `traecli` 被旧版占用，改用 `traex exec`。

## review

代码评审常用：

```bash
traecli review --uncommitted
traecli review --base <branch>
traecli review --commit <sha>
```

`traecli review` 与 `traecli exec review` 都用于非交互式代码评审。需要自定义评审指令时，在命令后追加 prompt，或用 `-` 从 stdin 读取。

## 非 Git 仓库

不在 Git 仓库时，交互模式可能拒绝启动；一次性任务可用：

```bash
traecli exec --skip-git-repo-check "<prompt>"
```
