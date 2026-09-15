# 项目指令（AGENTS.md）

`AGENTS.md` 是项目指导文档，会作为 model-visible instruction 注入。TraeX 通常从当前工作目录向上找到项目根，再按“项目根到当前工作目录”的顺序加载路径上的 `AGENTS.md`。默认项目根标记是 `.git`；如果没有找到项目根标记，就只考虑当前工作目录。不会越过项目根继续向上加载。

同一层级如果存在 `AGENTS.override.md`，它会作为本地 override 优先于 `AGENTS.md` 使用。额外 fallback 文件名可通过 `project_doc_fallback_filenames` 配置。把 `project_doc_max_bytes` 设为 `0` 会关闭项目文档加载。

全局用户级指导放在 `~/.trae/AGENTS.md`。它和 Trae IDE 共享；如果用户问“全局
Agents.md 放哪”，优先回答这个路径，再让用户用 `/status` 确认是否加载。

查看当前实际加载了哪些项目指导：

- TUI 里运行 `/status`，看 `Agents.md` 行。
- 需要排查配置层级或项目资源是否被信任时，用 `/debug-config` 和日志辅助确认。
- 发现预期文档没加载时，检查当前 cwd、项目根标记、目录信任状态，以及是否设置了 `project_doc_max_bytes = 0`。

也可以用 `/init` 创建一个含 TraeX 指引的 `AGENTS.md` 文件。
