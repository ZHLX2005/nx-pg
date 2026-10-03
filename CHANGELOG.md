# Changelog

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
