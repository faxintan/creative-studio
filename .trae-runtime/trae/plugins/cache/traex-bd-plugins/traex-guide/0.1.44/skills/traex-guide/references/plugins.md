# 插件与市场（Plugins & Marketplaces）

## 常用命令

```bash
traecli plugin list
traecli plugin install <source>
traecli plugin upgrade <name>
traecli plugin uninstall <name>
traecli plugin enable <name>
traecli plugin disable <name>
traecli plugin validate <name>
traecli plugin validate --path <dir>
traecli plugin marketplace list
traecli plugin marketplace list-plugins
traecli plugin marketplace add <source>
traecli plugin marketplace remove <name>
```

多个插件市场里存在同名插件时，在插件命令中使用 `<plugin>@<marketplace>`。

## 插件贡献能力

插件会贡献 skills、MCP servers、hooks、apps、models 等能力；用户通常直接使用插件贡献的能力，而不是操作“插件对象”本身。

内置 `Lark CLI` / `Codebase CLI` 插件主要是帮助安装对应 CLI 和 skills。如果用户已经用官方
命令安装好了 `lark-cli` 或 `codebase`，通常不需要再安装这两个插件；确认命令在启动
TraeX 的 shell `PATH` 里，并完成各自登录即可。

如果 `/plugins` 里安装这类 CLI 插件失败，先让用户用官方命令安装并重启 TraeX，再用
`/skills`、`lark-cli auth status` 或 `codebase auth status` 验证能力。不要把插件页
里的 `-` 直接解释为 CLI 没装成功；插件只是安装入口，不是唯一来源。

## Coco marketplace 迁移

Coco 旧的 `.coco-plugin/marketplace.json` 不等同于 TraeX 当前 marketplace 格式。TraeX
识别 Codex 风格的 `.agents/plugins/marketplace.json` 和 `.agents/plugins/<plugin>/...`
布局。

旧命令里 `coco plugin marketplace add --type=codebase <repo> --auto-update` 迁到 TraeX
时，先改用 git URL 或当前 CLI 支持的 source 形式，例如：

```bash
traex plugin marketplace add https://code.byted.org/<repo>.git --auto-update
```

如果用户是在给 TraeX 内置 BD 插件市场贡献插件，按项目里的 `.agents/plugins/marketplace.json`
和 `.agents/plugins/<plugin-name>/...` 布局回答，不要沿用通用 `plugins/<plugin-name>`
示例。

## 常见位置

已安装插件缓存通常位于：

```text
$TRAECLI_HOME/plugins/cache/<marketplace>/<plugin>/<version>/
```

git-backed marketplaces 通常安装在：

```text
$TRAECLI_HOME/.tmp/marketplaces/<marketplace>/
```
