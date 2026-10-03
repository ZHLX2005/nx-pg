---
name: nx-pg
description: 当用户要用 nx-pg 画布工作（把 md 变成画布上的思维导图树、AI 生成内容给人看、读取画布上下文继续协作）时使用 nx-pg CLI。触发词：nx-pg、画布、canvas、prg、思维导图、mindmap、dag、树、canvas dag、canvas export、最近文件、激活文件。不适用：与画布无关的通用编程问题；不需要落盘的纯文本讨论。
---

# nx-pg

本机画布工具：`nx-pg serve` 起本地面板，人用浏览器看画布；所有操作都有等价 CLI 命令——AI 与人操作同一套业务。

## 核心约定

1. **每个面板操作都有等价 CLI 命令**。AI 不需要开浏览器——CLI 能做面板能做的一切。
2. **追加式协作**：AI 生成内容一律落成**新文件**，绝不修改用户已有文件。
3. **先对齐上下文再动手**：生成前先查用户正在看什么、最近看什么。

## 命令速查

| 命令 | 说明 |
| --- | --- |
| `nx-pg serve [--port N] [--no-open]` | 启动面板（默认 127.0.0.1:7888，自动开浏览器） |
| `nx-pg routes` | 全部 CLI ↔ HTTP 对照表（**agent 摸底第一步**） |
| `nx-pg help [topic]` | 帮助；`--json` 输出可解析命令表 |
| `nx-pg health` | 自检（server 是否在跑） |
| `nx-pg canvas dag <text> [--file p] [--dir lr\|tb] [--name n] [--open]` | **md 多级列表 → 排版好的树 .prg**（AI 写画布的核心命令） |
| `nx-pg canvas export --file x.prg [--format md\|json]` | **.prg → 结构化输出**（AI 读画布；md 可再导回） |
| `nx-pg canvas active` | 用户当前在面板看的 prg |
| `nx-pg recent list` | 最近打开的 .prg |
| 任何命令 + `--json` | 机器可读输出（agent 一律加它） |

## agent 标准工作流（人机协作闭环）

**第 1 步 · 对齐上下文**（生成前必做）：

```bash
nx-pg canvas active --json    # 用户正在看哪个文件
nx-pg recent list --json      # 最近打开过哪些
```

**第 2 步 · 读画布内容**（如果要基于用户已有内容工作）：

```bash
nx-pg canvas export --file 用户文件.prg --format md
# 输出层级 md（# 标题/列表），与 canvas dag 的输入同构——读进来理解即可
```

**第 3 步 · 生成新树**（写 md 文件再传入，或 heredoc）：

```bash
# 先把 md 写到临时文件（推荐，最稳）
nx-pg canvas dag --file plan.md --dir lr
# 输出:
#   已生成 ~/.nx-pg/workspace/方案.prg（12 节点 / 11 连线，左右树）
#   打开: http://127.0.0.1:7888/?open=方案.prg
```

**第 4 步 · 交付**：把输出里的 `http://127.0.0.1:7888/?open=<文件名>` 告诉用户，点开即见排版好的树。server 没跑时先 `nx-pg serve --no-open` 后台起一个。

## canvas dag：md 输入约定

- 层级 = `#` 标题嵌套 + `-`/`1.` 多级列表（缩进成树）；正文行归属最近节点；`- [ ]` checkbox 剥离后当节点文字
- `--dir lr` 左右树（默认）/ `tb` 上下树；自动排版、节点不重叠
- **多块**：`---` 分隔行切块，各块独立成树并排摆放、互不连线；**单行块 = 独立节点**
- **重名自动追加序号**（方案.prg → 方案-2.prg）——用户已有文件永不被覆盖
- 输入优先级：`--file <任意路径>`（推荐）> 位置参数（单行短文本）> `-`（stdin）

### 多行 md 怎么传（heredoc 模板在前、错误对照在后）

**首选 `--file`**（不经过 shell 转义，最稳）：

```bash
nx-pg canvas dag --file plan.md --dir lr
```

**heredoc 成功模板**（全部 flag 在 `<<'EOF'` 之前、EOF 顶格）：

```bash
nx-pg canvas dag - --dir lr --name 方案 <<'EOF'
# 根节点
## 分支
- 叶子
  - 二级叶子
EOF
```

**四种实测错误**（按危害排序，前三种静默不报错）：

| 错误写法 | 实测后果 | 正确做法 |
| --- | --- | --- |
| `<<EOF` 不带引号 | 内容里 `$var`/反引号被 shell 展开或执行，树文本被改写 | 必须 `<<'EOF'` |
| flag 写在 heredoc 之后 | flag 变独立命令报错或参数静默丢成默认值 | flag 全在 `<<'EOF'` 之前 |
| `EOF` 前有空格 | bash 警告 end-of-file，后续命令文本全被吞进内容 | EOF 顶格行首 |
| 双引号字符串里写 `\n` 当换行 | `\n` 是字面反斜杠+n，`---` 多块不生效，整段变 1 个节点 | 用 `--file` 或 heredoc 传真实换行 |

漏写 `-` 会报「缺少输入」——唯一安全失败（会喊），前三种不喊。

## canvas export：读画布

- `--format md`（默认）：层级文本，可直接改完再 `canvas dag` 导回
- `--format json`：全量节点（uuid/文字/坐标）与连线，做几何/统计分析用
- 只能读 workspace 内的 .prg；路径越界报错

## 什么时候不用

- 与画布无关的纯编程问题
- 需要编辑既有画布细节（在面板里拖拽/编辑；CLI v1 只管「生成新树 + 读内容」）

## 数据与存储

- workspace（.prg 落盘处）：`~/.nx-pg/workspace`，env `NX_PG_WORKSPACE` 覆盖
- 状态 JSON（最近文件/激活文件）：包根 `.nx-pg-store/`，env `NX_PG_STORE_DIR` 覆盖
- `nx-pg store path` 查看实际路径；删除数据 = 删对应文件（无隐藏状态）

## references

- `references/00-design.md` —— 本工具解决什么问题、使用背景与场景
