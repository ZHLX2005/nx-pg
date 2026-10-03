# nx-pg

本机工具：CLI 与 Web 面板同源——`npx nx-pg` 起本地画布编辑（127.0.0.1），所有操作都有等价 CLI 命令。

## 快速开始

```bash
# 安装（一次性）
pnpm install

# 跑起来（自动打开浏览器）
pnpm start

# 或仅 dev（vite HMR + 后端并发）
pnpm run dev
```

启动后浏览器打开 `http://127.0.0.1:7888/`。详情、目录结构、设计意图见仓库内 `PROGRESS.md`（项目随迁移进度持续更新）。

## 命令

```bash
nx-pg serve [--port <port>] [--no-open]   # 启动本地服务（默认 7888，自动开浏览器）
nx-pg project fs read --path <p>         # 读文件（base64 输出）
nx-pg project fs write --path <p> --b64 <data>  # 写文件
nx-pg recent list                        # 最近打开文件（面板使用自动同步进来）
nx-pg canvas dag <text|--file f> [--dir lr|tb]  # md 多级列表 → 排版好的树 .prg
nx-pg canvas export --file x.prg [--format md|json]  # .prg → 结构化输出（md 可再导回）
nx-pg canvas active                      # 面板当前激活的 prg
nx-pg help                                # 完整命令表
```

## AI 人机协作（canvas）

让 AI 把一棵树放到画布上，人点开即见：

```bash
nx-pg canvas dag --file plan.md          # md 标题/列表嵌套 → 左右树
nx-pg canvas dag --file plan.md --dir tb # 上下树
# 输出: 已生成 ~/.nx-pg/workspace/plan.prg（N 节点 / M 连线）
#       打开: http://127.0.0.1:7888/?open=plan.prg
```

- 层级：`#` 标题 + `-`/`1.` 多级列表（缩进成树）；正文行归最近节点；checkbox 自动剥离
- **多块 dag**：`---` 分隔行切块，各块独立成树并排摆放；单行块 = 独立节点
- **追加式**：每次生成新文件，绝不改既有文件；布局自动排版不重叠
- **反向读取**：`canvas export --format md` 把画布导出为同构 md（改完可再导回）；`--format json` 给全量节点/连线
- **上下文对齐**：`canvas active` 看人正在看的文件、`recent list` 看最近文件（面板操作自动上报）

每条命令都对应一个 HTTP 路由（`/api/...`），agent 与面板走的是同一套业务。

## 系统要求

- Node.js ≥ 18（Vite 6 + ESM-only）
- Windows / macOS / Linux（跨平台已实测）

## 许可

MIT

## 来源

本仓库由 [project-graph](https://github.com/graphif/project-graph) 平移而来——把 Tauri 桌面画布应用改造为 Node 全栈 + Web 浏览器端的个人本地工具。Web 端唯一新增的交互是**手柄 Gamepad API**（左摇杆平移 + gamepadDeadzone 死区）；其它全部沿用原 project-graph 的 Canvas 2D 舞台、18 个鼠标控制器、快捷键系统（4538 行 shortcutKeysRegister）与 .prg 文件格式（zip.js + msgpack）。

## 已知边界

- AI / MCP / OCR / 全局快捷键 / 协作托管 / 账号 / 云同步 / 自动更新 / Tauri 桌面壳——全部**未迁移**（按需求排除）
- 移动端 Safari / 低端浏览器可能存在 Canvas 渲染兼容性差异
