# Changelog

## 0.5.0 · 2026-10-05

文件管理 + 注入式画布协作轮（用户点名三件套）。

- **`nx-pg canvas inject`——把 md 树注入用户正在看的画布（实时协作）**：
  AI 提交 md（`--file`/位置参数/stdin heredoc，输入约定与 `canvas dag` 一致）→ 服务端
  注入队列（≤20 条丢最旧、单条 ≤256KB）→ 面板 `CanvasInjectPoller` 每 2s take-all 拉取
  → 树出现在**当前视野右侧**（`generateNodeByMarkdown` + 前端 autoLayout，不改既有内容）。
  **不自动保存**——tab 挂未保存圆点，用户 Ctrl+S 决定留存；无打开画布时 toast 丢弃提示。
  页面隐藏暂停轮询、回前台立即拉一次。`canvas dag` 输出补提示行（文件模式之外的注入模式）。
- **工作目录文件浏览器（WorkspaceFilesWindow）**：全局菜单 文件→浏览工作目录 / 命令面板
  `openWorkspaceFiles`（无默认键位），默认停靠左侧。目录树懒加载折叠 + mtime 修改时间列
  + 文件名筛选；双击 .prg 打开；条目操作 打开/重命名（Dialog.input）/删除（确认后递归）；
  顶部 workspace 路径 + 刷新 + 新建文件夹/新 .prg。web 版没有系统文件对话框，
  从此不用再面对「prompt 列 8 个文件名」的模糊选择。
- **双击重命名**：双击 file 方案工程的 tab 标签 → 弹框输入新名字 → 磁盘 rename →
  工程 uri 与所有打开同文件的 tab 同步更新 → 最近文件列表旧删新加；目标已存在即拒绝
  （追加式约定：绝不覆盖）。draft 提示走 Ctrl+S 起名，collab 排除。
- **草稿保存起名**：保存对话框 shim 从「静默落 untitled-<时间戳>.prg」改为先弹输入框
  让用户起名（弹框异常时退回自动起名兜底），重名时间戳兜底保留。
- **连带修复回归**：`DetailsManager.markdownToDetails` 曾误实现为实例方法（原版是 static），
  `generateNodeByMarkdown` 全链路炸——canvas inject 是第一个自动化走这条链路的调用方才暴露。
  按原版补回 static 形状（实例方法保留兼容）。
- **服务端**：`project.fs.readdir` 条目加 `mtimeMs`；canvas 模块 21→23 actions。
- 随包 SKILL.md：agent 工作流第 3 步改为「注入模式（实时协作首选）/ 文件模式（落盘留档）」
  双轨 + inject 边界说明；diff-log 登记 A03/A04（A04 写清与 A02「否决轮询」的演进关系）。
- 测试：canvas 单测 +2（inject 队列 take-all / 超长拒绝）共 28 unit + smoke 23 actions 全绿；
  headless Chrome 实测注入链路（CLI → 队列 → 2s 拉取 → 画布节点出现，修复前 console
  抓到 TypeError）与文件浏览器渲染（菜单点击路径，截图验证）。已知边界：headless 合成
  键盘进不了 Controller 管线，双击改名/保存起名的弹框交互留真机验证；take-all 单消费者
  （多开面板先拉先得，个人单面板主场景）。

## 0.4.1 · 2026-10-04

快捷键体验修复轮。

- **修快捷键设置页冲突误报**：空键位（未绑定）命令被 `"" === ""` 判成互相冲突，
  114 个未绑定命令全部挂 ⚠「与 … 重叠」（设置分组框边框、另存为、手动备份、协作、导入图片……）。
  冲突检测抽为 `isKeyBindOverlap` 纯函数（`utils/keyDisplay.tsx`），空键位永不参与冲突。
  真实默认键位冲突（原版遗留的 C-t / w / i 等约 28 对）仍正常提示。headless Chrome 实测断言。
- **双击 Esc 清空快捷键序列栈**：序列键（如 `q e`、`r e f`）靠事件队列攒前缀，按一半弃用后
  残留前缀会让下一次按键被误判成序列第二步。现在 400ms 内双击 Esc 显式清栈
  （第一下照常入队不影响 Esc 已绑定的动作，第二下清空并短路）。
- 收录 `.claude/skills/diff-log/`（开发侧项目 skill：登记 nx-pg 相对原版的特化 diff）。

## 0.4.0 · 2026-10-03

canvas 人机协作轮（新功能域 + 一个存量严重 bug 修复）。

- **`nx-pg canvas dag`——md 多级列表一键变画布树**：提交 `#` 标题 + `-`/`1.` 多级列表的 md，
  自动解析层级、排版成左右树（`--dir lr`，默认）或上下树（`--dir tb`）的思维导图 .prg，
  落盘 workspace 并打印可点 URL（`http://127.0.0.1:7888/?open=<文件名>`），点开即见。
  正文行归属最近节点；checkbox 自动剥离；`---` 分隔多块 dag 各自独立成树并排摆放；
  单行块 = 独立节点；重名自动追加序号，**绝不覆盖既有文件**（追加式协作）。
- **`nx-pg canvas export`——画布结构化输出给 AI**：.prg → 层级 md（与 dag 输入同构，
  改完可再导回，双向闭环）或全量 JSON（节点 uuid/文字/坐标 + 连线）。按形状识别实体，
  旧存档兼容。
- **`canvas active` / `recent list` 上下文对齐**：面板打开文件时自动上报（fire-and-forget），
  AI 用 `canvas active` 看用户正在看什么、`recent list` 看最近用过什么，先对齐再生成。
- **AI 标准协作闭环**：`canvas active` 对齐上下文 → `canvas export` 读画布 →
  `canvas dag` 生成新树 → URL 交付。SKILL.md 含完整工作流与 heredoc 模板（含四种实测错误对照）。
- **修复 .prg 序列化契约 bug（存量）**：生产构建压缩类名（TextNode→Le）导致存档既打不开
  外部生成的文件、也不可移植（换构建版本旧档即废）。vite 构建期注入 `static className`
  保留真实类名（unplugin-original-class-name 有泛型误注入 bug，用 20 行本地插件替代）。
  此后所有存档类名稳定。
- **新基建**：`src/core/workspace.js`（工作目录 + 路径白名单从 project 模块下沉共享）；
  前端 `?open=` 直达链接钩子；eslint 补 `.tool/**`/`.claude/**` 忽略。
- 测试：+21 个（canvas 单测 21 个：parse/layout/prg/action/stdin-heredoc 全覆盖，含
  spawnSync 直达 stdin 的多行输入测试），全套 26 unit + smoke 21 actions 全绿；
  headless Chrome 截图验证 lr/tb/多块排版与上报链路（server 请求日志实证）。

## 0.3.0 · 2026-10-03

快捷键设置轮（用户点名需求 + 右侧栏清理）。

- **快捷键设置页**：设置面板新增「快捷键设置」入口。`key-bind` 录键组件从 stub 换为原版真实现
  （组合键 / 序列键如 q e / 持续型录制，⌫ 删除一步、✓ 确认生效）。设置页按功能分组列出全部应用内
  快捷键（已裁剪命令自动隐藏），每行支持：**点击键位框录新键**、启用/禁用开关、一键重置默认、
  **冲突提示**（含序列前缀重叠检测，如 q 与 q e）。改动即时生效并持久化，无需重启。
- **右侧栏旧数据迁移**：快捷设置栏的 localStorage 存档若含 web 化已删功能的开关（隐身模式×2、
  调试显示、隐私保护×2、窗口收窄×2、节点详情面板），启动时自动剔除并回写——老用户不会再看到
  点了没反应的孤立开关。

取舍记录见仓库 PENDING.md。bundle 无显著变化。

## 0.2.0 · 2026-10-03

UI 一致性与操作连贯性优化轮（6 轮迭代，全部经 headless Chrome 实测验证，每轮 pnpm test 全绿）。

- **按 Agent.md 清理排除项**：菜单栏删 AI / 扩展 / 关于；window 菜单收窄为背景网格组；文件菜单删协作与
  deep-link。已持久化的旧菜单配置通过「含已删 id 即整体重置」兜底。删右上角窗口控制按钮（钉住/最小化/
  最大化/关闭，Tauri 桌面能力）与 Windows 触发角。
- **CommandPalette 排除命令过滤**：新增 `excludedCommands.ts` 集中名单（AI/扩展/协作/深链/桌面窗口/
  隐身/教程/开发者工具共 50+ 命令 id），命令面板按名单过滤——菜单与面板共用一份名单不会漂移。
- **粘贴图片自动打框**（Agent.md 第 10 条）：`imageNodeFactory` 的 wrapInSection 回退到
  `Settings.wrapImageInGroup`（原版语义），默认开启，设置面板新增开关。实测贴 240×120 PNG
  自动包分组框、状态栏节点数 0→2（图+框）、0 异常。
- **修递归导入文件夹**（原来点击必报错）：`invoke("read_folder_recursive")` 是 Tauri Rust 命令，web shim
  无条件 throw——改为前端 BFS 遍历 server 的 `project.fs.readdir`；dialog shim 实现目录选择（prompt 输入
  workspace 相对路径 + exists 校验）。**根因修复**：server 端 `resolveWorkspacePath` 不认 `file:///` URL，
  recent 列表里的记录全部被 `validAndRefreshRecentFiles` 当「文件丢失」清掉——现在用 `fileURLToPath`
  剥协议头，单点修全链路（GlobalMenu 最近文件、缩略图读取同受益）。实测导入嵌套目录 2 个 .prg 成功入列。
- **恢复 ColorWindow 调色板**：从上游直接复制（零 Tauri 依赖），右键菜单三个颜色入口与 F6/S-F6 快捷键
  从静默无效变真实可用。
- **「打开文件夹」类入口给反馈**：配置/缓存/默认备份/自定义备份/工程所在目录 5 个入口在 web 下
  `shellOpen` 静默无效——改为 toast 显示真实路径 + 复制到剪贴板。
- **节点详情编辑**：`NodeDetailsWindow` 从 no-op stub 变为真实 textarea 子窗口（details → markdown →
  编辑 → 写回，Ctrl+Enter 保存 / Esc 取消，Ctrl+Z 撤销整次编辑）。Ctrl+双击节点触发。
- **右侧快捷设置栏默认项**：剔除隐身×2 / showDebug 三个与菜单裁剪矛盾的孤立开关，换成 web 高频项。
- **清理**：KeyboardRecentFilesWindow 每次按键弹 toast 的调试残留；WelcomeWindow 删教程下载/公告死代码/
  AMD 警告与 9 条桌面专属小技巧；右键菜单删涂鸦画笔颜色项。

取舍与已知限制见仓库 PENDING.md（共 11 条，含 Ctrl+E 双绑定、孪生同步跳过、SettingsWindow 完整移植
暂缓等）。bundle gzip 949 → 967 kB（+18 kB，主要是新页面与图标的真实渲染）。

## 0.1.7 · 2026-10-03

UI 修复轮（4 个 commit）。三项此前完全不可用的功能修通，全部经真实浏览器实测验证。

- **修黑夜模式失效**：标题栏明暗开关点了没反应。根因是修死循环时把 `themeMode` / `lightTheme` / `darkTheme`
  三个 watcher 删掉了，开关只写 `Settings.themeMode` 而无人消费。改成无环的两级链路
  `themeMode → theme → 界面`。实测 `--background` 由 `oklch(0.141 …)` 变为 `oklch(0.97 0.01 230)`，
  连点 6 次严格明暗交替、0 异常。
- **修图片粘贴**：Ctrl+V 贴图此前完全不通，共断四处 —— ① `imageNodeFactory` 是「只 new 不入台」的占位实现，
  节点从没 `stageManager.add`，且尺寸恒为 100×100；② AUTO 模式在浏览器下 `isMac/isWindows/isLinux` 恒为 false，
  一路掉进 tauri 分支去调无条件 throw 的 `readImage()`；③ `clipboard.read()` 未捕获异常会把 paste 打成
  unhandled rejection；④ 一次 Ctrl+V 会贴出「图片 + 多余空文本节点」。实测：写入 240×120 渐变 PNG →
  真实 Ctrl+V → 节点数 0→1，截图确认按原尺寸画在画布上。
- **换成真 lucide 图标**：此前所有图标都是同一个「盒子」占位（1172 行 stub）。复核发现当初记录的
  `forwardRef is not a function` 已不复现（React 19.3 的 forwardRef 仍是函数，lucide peer 支持 ^19.0.0）。
  删除 alias 与 stub。实测 23 个图标 23 种形状、0 空图标、0 异常。
  代价：bundle gzip 799 → 949 kB（因两处按名查表的命名空间导入无法 tree-shake）。
- **新增画布状态栏**：左下角实时显示 缩放% / 节点 / 连线 / 选中 / FPS / 上限，250ms 轮询只读字段，不触碰渲染管线。

顺带修：设置面板主题下拉此前因选项硬编码漏了默认值 `morandi` 而显示空白；图片改走
`project.addAttachment` 以便随 `.prg` 一起保存。

### 关键架构决策

- **明暗切换必须单向**：Settings 的 `set` trap 无条件通知 listeners，原版 4 个 watcher 互相回写必然成环
  （这正是之前白屏的根因）。「记住上次用的亮/暗主题」改由用户主动挑主题时单向记一次，不放 watch 链里。

## 0.1.0 · 2026-10-02

首发。Node 全栈 + Web 浏览器端的个人本地画布工具。功能范围：

- Canvas 2D 舞台：18 个鼠标控制器 + 双击建节点 / 中键平移 / 滚轮缩放 / 框选 / 撤销重做
- 快捷键：Ctrl+A/C/V/Z/S、Delete、F、Tab 等平移自 project-graph
- 节点编辑：双击 TextNode 弹出 inline textarea
- Gamepad API（唯一新增）：左摇杆平移视口 + gamepadDeadzone 死区；A/B/LB/RB/Start 映射
- .prg 文件：保存 / 重新打开 stage 恢复 roundtrip=true（zip.js + msgpack）
- Node server：.prg 文件读写 + 最近文件列表 + workspace 工作目录管理 + 127.0.0.1 绑
- 设置面板：主题切换 / 背景网点 / 渲染 FPS / 手柄死区（localStorage 持久化）

已知不在本版范围：AI / MCP / OCR / 全局快捷键 / 协作 / 账号 / 云同步 / 自动更新 / Tauri 桌面壳。

### 关键架构决策

- **Tauri API → 浏览器 shim**（19 个：fs/dialog/clipboard/window/state/store/...）：vite alias 映射到 `app/shims/`，把 fs API 转接到 server `/api/project/fs/*`
- **lucide-react / react-i18next**：React 19 + esbuild 组合下初始化崩溃，整体指向 1100+ 空 stub（图标后续迭代恢复）
  —— 注：图标 stub 已在 0.1.7 移除，复核后确认当时的崩溃结论已不复现；react-i18next 的 stub 仍在用
  （其 `lookupAllNamespaces` 跨 namespace 兜底的取舍见 pending.md）
- **路径越界**：server `resolveWorkspacePath` 在 Windows 下统一 `toLowerCase()` 比较盘符，修复 vscode-uri `URI.file()` 归一化为小写盘的拦截
- **ProjectOwnership 单进程版**：去掉 Tauri 跨进程 ownership 锁，web 版只保留 attach/activate/saveAs/dispose API + 写盘成功后回写 uri
- **Settings 持久化**：原始 LazyStore → 自制 plugin-store shim（localStorage KV）
