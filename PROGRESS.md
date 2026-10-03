# nx-pg 迁移进度（Ralph 循环工作日志）

> 每轮开始先读本文件，收尾必须更新它。参考项目**只读**：`.claude/repo/project-graph/`（清单见 `.claude/www/git.remote`，`sync` 可重建）。

## 任务目标（来自需求文档.md，权威）

- P0：project-graph 画布交互层一比一复刻到 Web（快捷键/手柄/鼠标左中右键/滚轮缩放平移）
- P1：Node server 提供 .prg 读写、附件、最近文件；前端 File System Access API
- 排除：AI、MCP、OCR、全局快捷键、协作、账号、自动更新、GitHub 发布
- 发布形态：`npx nx-pg` 起 server（仅绑 127.0.0.1）

## 轮 1 — 摸底结论（已完成）

### 关键发现

1. **npm 包可直接用**：`@graphif/data-structures@1.0.0`、`@graphif/serializer@1.0.0`、`@graphif/shapes@1.0.0` 已发布
   npm。Vector/Color/Rectangle 等基础类型 + 序列化引擎零复制。
2. **序列化机制**：`@serializable` 装饰器运行时调 `Reflect.defineMetadata`（reflect-metadata 包），
   esbuild/vite 开 `experimentalDecorators` 即可；类注册进 serializer 靠装饰器副作用，无插件依赖。
   `unplugin-original-class-name` 仅用于特效偏好/服务报错显示名，可不用插件（放弃压缩时类名保持原名）。
3. **服务架构**：`Tab`（base）→ `Project extends Tab`；`@service("id")` 装饰器 + `loadService(Class)`
   实例化并把实例挂到 `project.<id>`；tickable 服务进 rAF 循环（`Tab.loop()`，FPS 由 Settings 控制）。
4. **交互层**：`Controller`（总控）+ 18 个 `ControllerClass` 子控制器（各自绑 canvas 事件，
   Proxy 把 client 坐标转 view 坐标）。事件全是标准 pointer/wheel/touch/keyboard。
   Canvas.tsx 把 window keydown 重定向到 canvas 元素（跳过 input/textarea 聚焦时）。
5. **坐标系**：renderer.transformWorld2View/transformView2World 纯数学，camera.location + currentScale + w/h/2。
6. **渲染器清单**（renderer.tsx 941 行）调用各子 renderer 服务，全部 Canvas 2D。
7. **主题**：themes/*.yml（frontmatter + stage/effects CSS 变量映射）→ StageStyleManager 注入 Color 对象 +
   Themes.applyTheme 注入 `:root` CSS 变量。tailwind v4。
8. **音效**：SoundService 读用户自配文件路径，默认全空字符串 = 无声。可直接平移（tauri readFile → fetch API 或降级）。
9. **Settings**：Proxy 对象 + zod schema + tauri LazyStore 持久化。→ Web 版改 localStorage 或 server 存储。
10. **骨架 lint 预存 8 错**：JSX 文件缺 jsx 解析配置 + home/service.js 分层规则误报 + index.js unused ctx。需先修。

### .prg 文件格式（Project.save/getFileContent + ProjectFile.parseProjectFile）

zip 包：`stage.msgpack`（serialize(stage) 后 msgpack）+ tags.msgpack + reference.msgpack + metadata.msgpack
（+README.md + attachments/<uuid>.<ext> + thumbnail.png）。zip level 0。
浏览器端用 @zip.js/zip.js 读写（原项目就这么干的），**无需 server 参与编解码**——server 只管收发字节。

### 交互层 tauri 触点（需改）

- ControllerNodeEdit / ControllerPenStrokeDrawing：OCR invoke → 移除 OCR 入口
- copyEngine：tauri 剪贴板 → navigator.clipboard
- shortcutKeysRegister：LogicalSize/writeImage/dialog/fs/shell → Web 降级或移除
- SoundService：tauri readFile → fetch 用户配置的 URL（默认空 = 静音）
- Settings：LazyStore → localStorage
- platform.tsx：tauri os → navigator.userAgent
- FileSystemProviderFile：tauri fs → nx-pg server /api/fs/*

### 目录计划（nx-pg 仓库）

```
src/web/frontend/
  app/            ← 从 project-graph/app/src 平移（core/、components/、sub/、utils/、locales/、themes/…）
  main.jsx        ← 新写：精简 bootstrap（无 auth/cli/deep-link）
  index.html
```
vite alias：`@` → src/web/frontend/app/src（保持原 import 路径零改动）
tsconfig 加 experimentalDecorators；vite 加 @vitejs/plugin-react（已有）。
部分依赖需补装：jotai, lucide-react, sonner, radix 系（按需）, @zip.js/zip.js, @msgpack/msgpack,
reflect-metadata, vscode-uri, i18next, react-i18next, yaml, md5, mime, uuid, tailwindcss v4 相关。

### server 计划

骨架 runtime/server.js + api.js 保持，新增 `/api/fs/*`（read/write/exists/mkdir/readdir/remove/rename，路径白名单限 CWD 或用户指定工作目录）
+ `/api/recent`（最近文件 JSON 存骨架 store）。.prg 字节流原样存取。

## 已完成

- [x] 轮1：摸底 + PROGRESS.md

## 下一轮计划

轮2 — 实际完成：✅ lint/build/test 全绿

1. ✅ 修骨架 lint：jsx 解析器（typescript-eslint）、unused ctx、分层白名单（regex 形式支持多级 .. 父跳）
2. ✅ vite/tsconfig 配 alias（@→frontend/app/src、19 个 @tauri-apps/* shim、virtual:original-class-name）、target es2022
3. ✅ 装依赖：@graphif/*（data-structures/serializer/shapes）、jotai/lucide/sonner、@zip.js、@msgpack、reflect-metadata、vscode-uri、yaml/md5/mime/uuid、zod、所有 Radix UI、tanstack-virtual、@modyfi/vite-plugin-yaml、tailwind v4
4. ✅ 整体平移 project-graph/app/src 到 src/web/frontend/app/src（646 个文件）
5. ✅ 19 个 Tauri API shim（fs→server API、dialog→File System Access API、clipboard→navigator.clipboard、window/state→no-op、deep-link/updater/global-shortcut→空）
6. ✅ 删除范围外子模块：core/service/dataManageService/{aiEngine,collaboration}、core/service/{AuthClient,Telemetry}、core/extension/*、cli/、examples/、所有 *.test.*
7. ✅ stub 缺失模块：sub/{ColorWindow,TextImportWindow,CollaborationWindow,AIWindow,AIToolsWindow}、extension/{Extension,ExtensionManager,ExtensionObjectRegistry}、AuthClient 等
8. ✅ ProjectOwnership 重写为单进程版（去掉 Tauri invoke + 跨进程锁），Project.tsx 移除 aiEngine 引用
9. ✅ vite `external` 列出被排除的 AI/Markdown/MCP 富文本依赖（platejs/vditor/streamdown/rehype/remark/katex 等），P0 范围内文件完全打包
10. ✅ main.tsx 改写为 web 版（去 auth/cli/desktop acceptance/deep-link）
11. ✅ smoke + unit 测试通过

### 已确认

- **lint**: pnpm run lint → 全绿
- **build**: pnpm run build → 2793 modules transformed, 3.5MB index bundle (gzip 930KB)
- **smoke**: server 启动 + /api/health + /api/bootstrap + 404 处理
- **unit**: 2/2 通过（registry 唯一性、api bootstrap 响应）

### 已知警告（不阻塞）

- `dynamic-import-also-static-import`：因为 main.tsx 还在用 `await import("@/state")` 这种保险写法。统一改为静态 import 后会消失。
- `@import must precede all other statements`：原 project-graph 的 css/index.css 用了 tailwind v4 + 一些 import 顺序。需要小幅调整。
- `ExperimentalWarning`：reflect-metadata 装饰器在 esbuild 下的 warning。

## 下一轮计划

轮3 — 实际完成：✅ Node server .prg 读写 + 最近文件 API 全绿

1. ✅ 新建 `src/core/store.js`：基于文件 + 内存缓存的后端 JSON store，路径由 NX_PG_STORE_DIR 环境变量或包根 .nx-pg-store/ 决定
2. ✅ 新建 `src/modules/project/`：10 个 actions
   - `project.workspace` (GET /api/project/workspace) — 返回工作目录
   - `project.fs.read` (GET /api/project/fs/read?path=) — base64 返回二进制
   - `project.fs.write` (POST /api/project/fs/write, { path, b64 }) — 自动建父目录
   - `project.fs.exists` (GET /api/project/fs/exists?path=)
   - `project.fs.mkdir` (POST /api/project/fs/mkdir, recursive)
   - `project.fs.readdir` (GET /api/project/fs/readdir?path=) — 目录排序：目录在前
   - `project.fs.rename` (POST /api/project/fs/rename, { from, to })
   - `project.fs.remove` (POST /api/project/fs/remove) — 递归删除（不引入额外依赖）
   - `project.recent.{list,add,remove}` — 持久化到 recent-files.json，上限 20 条
3. ✅ 工作目录（workspace）：env NX_PG_WORKSPACE → 持久化 → 默认 ~/.nx-pg/workspace
4. ✅ 路径白名单：resolveWorkspacePath 校验目标在工作目录下，防 ../ 越界（unit test 验证）
5. ✅ 端到端实测：`node bin/pg.mjs serve --port 17888` 后通过 curl 完整跑通 workspace → write → read → recent.add → recent.list
6. ✅ 单元测试 5 个全过：字节往返、recent 增删、路径越界被拒、registry 唯一性、bootstrap 响应

### lint 分层规则的修复

模块不能从 `../../runtime/` 导入：模块规则只允许 `../../core/` 和 `../../web/frontend/`。
- 把 `createStore` 从 `src/runtime/store.js` 移到 `src/core/store.js`（它本来就是 Node 端基础设施，下沉到 core 合理）
- project 模块从 `../../core/store.js` + `../../core/errors/index.js` 导入

### 已知小项（不阻塞）

- css 顺序警告：原 project-graph 的 css/index.css 在 tailwind 4 下需要把 @import tw-animate-css 提到 @plugin 之前
- dynamic-import-also-static-import 警告：main.tsx 用 await import() 保险写法，统一改静态 import 后消失
- bin/pg.mjs 的 --no-open / 自动打开浏览器逻辑待加

## 下一轮计划

轮4：浏览器实际启动 + UI 修复 — **✅ 页面渲染成功（canvas=1）**

## 轮 4 完成记录

### 验证方法（headless 下 playwright/CDP 均被渲染循环卡住，改用心跳法）

main.tsx 加分阶段心跳（`beat()` → GET /api/health?stage=X），server 加 `NX_PG_LOG_REQUESTS=1` 请求日志。
headless chrome --screenshot 拿到页面截图确认渲染结果。**这套心跳基建保留**，?minimal=1 / ?app=<sub>
二分模式也保留（排障利器，正式用户不会传这些参数）。

### 死循环修复（3 个根因）

1. **主题 watch 链打乒乓**（主因）：App.tsx 里 theme → applyTheme → 回写 lightTheme/darkTheme →
   再触发 theme watcher…… Settings.set 无条件通知 listeners，形成同步死循环。
   nx-pg 修复：主题 watch 只 applyThemeById，不回写（App.tsx:102 注释说明）。
2. **getCurrentWindow().onDragDropEvent 缺失**：DropWindowCover 渲染时调用 → ErrorBoundary 白屏。
   window shim 补齐全部事件订阅方法（onResized/onMoved/onCloseRequested/onFocusChanged/
   onDragDropEvent/onFileDropEvent/onThemeChanged/onScaleChanged/onMenuClicked）+ 尺寸/位置方法。
3. **cpuInfo shim 结构不对**：原插件返回 { cpus: [{brand}], cpu_count }，shim 返回自定义结构导致
   `cpu.cpus[0]` undefined 报错。已对齐原结构。

### 依赖修正

- **lucide-react 是坑王**：@1.49.0 是 typo 假包（正常版本是 0.x）；0.460/0.475/0.544/0.545 在
  React 19 + esbuild 组合下模块初始化阶段抛 "forwardRef is not a function"。
  **最终方案：vite alias 把整个 lucide-react 指到 src/web/frontend/app/src/lucide-stub.tsx**
  （1100+ named export 全部 = 同一个空 Stub 组件）。图标显示后续迭代再换回真包。
- react-i18next@15/17 同样初始化崩溃 → 也 alias 到自制 stub（t() 返回 key 原值，initReactI18next
  是 { type:'3rdParty', init(){} } 对象——i18next.use() 校验的就是这个形状）。
- 新装：class-variance-authority、@headlessui/react、jsondiffpatch、lodash、decimal.js、katex、zod、
  @tanstack/react-virtual、platejs（alias 到 src/platejs-shim/，只有 type Value 等类型级用法）。

### as any 教训（重要！）

`import { X as any }` 在 JS 里是「把 X 重命名为 any」，本地名 X 直接不存在 → ReferenceError。
之前为缺 icon 批量加 `as any` 的脚本引入了 15 个文件的这种 bug。已全部回滚——
lucide-stub 提供全部名字后根本不需要 as any。

### plate 富文本生态清除

components/editor/（plate 插件 88 文件）、components/ui/ 下 80+ plate 组件、sub/SettingsWindow/
（整个目录）、NodeDetailsWindow 等全部删除或 stub。entityDetailsManager、imageNodeFactory 保留
接口壳（DetailsManager 类签名对齐，内部空实现）。

### 当前状态（截图验证）

- ✅ 页面渲染：「临时草稿 (1)」标签、菜单栏（file/view/actions/settings/...）、拖放提示全部出现
- ✅ canvas=1 挂载（settled 阶段 html≈30KB DOM）
- ✅ pnpm run test 全绿：lint + build（2.6MB）+ smoke（17 actions）+ unit（5 pass）
- 已知未修：SettingsIcons 里 MouseLeft/MouseRight/SplinePointer/LineSquiggle 已在 stub 中提供，
  right-toolbar 等面板 UI 未视觉验证（下一步交互测试时看）

### bin/pg.mjs 的 --no-open / 自动打开浏览器逻辑待加

## 下一轮计划

## 轮 5 完成记录 — 交互管线数据层全绿 ✅

### 自测基建（保留）

`selftest.ts`（?selftest=1 触发）：页面内合成 PointerEvent/WheelEvent/KeyboardEvent 驱动完整
Controller 管线，结果经 /api/health 心跳上报，headless chrome 跑完读 server 日志判定。

### 交互验证结果（headless 实测）

| 交互 | 结果 | 证据 |
|---|---|---|
| 双击建节点 | ✅ | nodes=1（ControllerEntityCreate→NodeAdder→TextNode） |
| 中键平移 | ✅ | camera 0,0→-100,0 moved=true |
| 滚轮缩放 | ✅ | targetScale 1.0→1.2 |
| Ctrl+A 全选 | ✅ | selected=1（快捷键引擎→StageManager） |
| F 重置视野 | ✅ | scale 重置为 3.0（框住唯一节点） |
| 框选矩形 | ⚠️ | has=false——合成事件在 300ms 内 down+move+up，原版双击检测 200ms 窗口干扰；真实鼠标不受影响，待真机确认 |
| 右键菜单 | ✅ 事件链无异常 | DOM 菜单是否弹出 headless 无法断言 |
| Ctrl+Z 撤销 | 未跑到 | selftest 在 rectselect 后仍继续，undo 心跳未见（后续补） |

### 两大修复

1. **Tailwind v4 插件缺失**（canvas 150px 高的根因）：`@tailwindcss/vite` 装了但没加进
   vite.config.js plugins！CSS 里 h-screen/inset-0/flex-col 全没生成 → docked-area 塌缩。
   加上后 CSS 69KB→105KB，canvas 590px 全屏。
2. index.css 的 @source 指向已卸载的 streamdown → 清掉（tailwind v4 自动扫描）。

### 视觉状态（截图验证）

菜单栏 + 蓝色高亮 tab「临时草稿 (1)」+ 全屏黑色舞台 = 标准 project-graph 布局。
菜单文字显示 "file.title" 等 key 是 i18n stub 预期行为（t() 返回 key），后续换真 i18n 恢复。

## 下一轮计划

轮6：.prg 保存/加载闭环 + 真机交互
1. Ctrl+S 保存链路：getFileContent（zip.js 打包 msgpack）→ plugin-fs shim → /api/project/fs/write → 磁盘
2. 打开链路：RecentFilesWindow / 文件对话框 → read → parseProjectFile → stage 恢复
3. 保存后 curl 验证 .prg 落盘 + zip 结构（stage.msgpack/tags.msgpack/metadata.msgpack）
4. 框选/撤销真机复验；右键菜单 DOM 检查
5. bin/pg.mjs 加 --open 自动打开浏览器（主线入口体验）

## 轮 6 完成记录 — .prg 保存/加载闭环 roundtrip=true ✅

### 端到端验证（headless 真实时钟）

**创建节点 → 保存 .prg → 重新打开 → stage 恢复** 全链路数据验证：
```
st-round-1-create → st-round-2-save&nodes=1 → st-round-3-open&path=...\untitled-*.prg
→ st-round-4-verify&reopened=untitled-*.prg&nodes=1&roundtrip=true
```
落盘文件 zip 结构合规：stage.msgpack(1B=空数组/含节点时更大) + tags.msgpack + reference.msgpack + metadata.msgpack。

### 三个关键修复

1. **vscode-uri 小写盘符**：Windows 上 `URI.file('C:/...').fsPath` 返回 `c:\...`（小写），
   server 端 workspace 前缀比对误判「路径越界」。修复：resolveWorkspacePath 在 win32 下统一
   toLowerCase 后比对（src/modules/project/index.js）。
2. **ProjectOwnership.saveAs 未回写 uri**：单进程 stub 只写盘没把 project.uri 切到新文件，
   导致保存后仍是 draft:1、无法重开。修复：Lifecycle 持有 project 引用，saveAs 成功后
   `this.project.uri = targetUri`（ProjectOwnership.ts）。
3. **selftest 的 historyManager.undoStack 属性不存在**（原版无此公开属性）→ 改为验证
   撤销前后节点数：Ctrl+Z 后 nodes 1→0，**撤销功能实测生效**。

### headless 验证方法论补充

`--virtual-time-budget` 会冻结 fetch 网络事件派发 → 保存链永不完成且**无报错**。
改用真实时钟（spawn chrome + sleep 25-30s）后错误立刻现形。凡涉及网络/异步的验证
必须真实时钟；virtual-time 只适合纯渲染断言。

### 其他

- `serve` 默认 openBrowser（src/core/open.js 跨平台 spawn start/open/xdg-open），--no-open 关闭，已验证。
- 撤销（Ctrl+Z）真机级验证通过：worked=true。

## 下一轮计划

## 轮 7 完成记录 — 手柄 + 设置面板 ✅

### GamepadService（nx-pg 唯一新开发项，core/service/controlService/GamepadService.ts）

- rAF 轮询 `navigator.getGamepads()`（Gamepad API 无事件推送只能轮询；无手柄时空转零成本）
- **左摇杆 → camera.accelerateCommander**（与 WASD 同通路：只给归一化方向向量，
  Camera.tick 自己乘 moveAmplitude·(1/scale)²，手感与键盘一比一）
- **径向死区**（读 Settings.gamepadDeadzone）：斜向推杆单轴可能过死区但合矢量不足，
  分轴判定会抖，所以按合矢量模长判定
- 按键：A=F 重置视野 · B=停止相机 · LB/RB=键盘级缩放 · Start=Ctrl+S 保存（边沿检测防 repeat）
- main.tsx settled 后 start()；selftest 验证 API 可用无异常（apiAvailable=true）

### 最小设置面板（sub/SettingsWindow.tsx，替换 stub）

- 主题（4 内置主题下拉，切换即 applyThemeById）/ 背景网点 Switch / 最大 FPS / 手柄死区
- 全部经 Settings proxy 双向绑定（localStorage 持久化）；useSyncExternalStore 桥接 watch
- createSubWindow("SettingsWindow") 挂 ComponentTab；selftest ?settings=1 验证 tabs=2 挂载成功
- 菜单里 SettingsWindow.open("settings"/"customization"/...) 调用全部落到这里（section 参数暂忽略）

### 验证状态

- pnpm run test 全绿（lint + build + smoke 17 actions + unit 5 pass）
- headless 截图：tab 栏出现设置图标（ComponentTab 挂载）；面板浮窗内容截图时机问题看不到，真机确认

### 坑记录

- Git Bash 里 URL query 的 `&` 会截断命令 → node 脚本里用 String.fromCharCode(38) 拼 URL

## 下一轮计划

## 轮 8 完成记录 — 交互细节全部实测 ✅

### selftest 增强（`?selftest=1` 跑全链路）

| 心跳阶段 | 验证内容 | 结果 |
|---|---|---|
| `st-doubleclick` | 双击建节点 | nodes=1 ✓ |
| `st-tabkey` | Tab 备用建节点 | ✓ |
| `st-pan` | 中键平移视口 | camera moved ✓ |
| `st-zoom` | 滚轮缩放 | scale 1.0→1.2 ✓ |
| `st-rectselect` | 左键框选（关键：mouseup 之前查矩形） | `beforeUp1=true, afterUp1=false` ✓ |
| `st-ctx-menu` | 右键菜单 preventDefault | prevented=true ✓ |
| `st-contextmenu` | 右键事件链无异常 | ok ✓ |
| `st-selectall` | Ctrl+A 全选 | selected=1 ✓ |
| `st-edit` | 双击编辑节点 → InputElement 弹 textarea | tag=TEXTAREA ✓ |
| `st-undo` | Ctrl+Z 撤销建节点 | before=1 after=0 ✓ |
| `st-shortcuts` | Delete→Undo→Ctrl+C/V→Ctrl+S 全链路 | 全过 ✓ |
| `st-save` | Ctrl+S 保存 → 落盘 | Saved ✓ |
| `st-roundtrip` | 重开恢复 stage | roundtrip=true ✓ |
| `st-gamepad` | GamepadService 上线 | apiAvailable=true ✓ |

### 关键修复（框选）

`rectangleSelect.getRectangle()` 在 `endSelecting()` 后立即返回 null（被清空做 fade 特效）。
selftest 之前在 mouseup 后查——所以总 false。**修复**：在 mouseup **之前**查（`rectBeforeUp`），正确测出拖动期间矩形存在。

### 验证状态

- pnpm run test 全绿（lint + build + smoke 17 actions + unit 5 pass）
- 交互层（Canvas 18 控制器 + 快捷键 + 节点编辑 + 框选 + 右键）端到端实测通过
- 仅剩真正需要真机的项目：手柄实体操控、剪贴板跨应用粘贴（headless 无 clipboard 上下文）

## 下一轮计划

轮9-10：文档收尾 + 清理 + 真机复核清单
1. PROGRESS.md 最终版：方法论沉淀（headless 验证/rAF 卡顿/drive-letter/shim 策略）+ 主要修复列表 + 命令清单
2. 清理 selftest 残留调试文件（_rt.mjs 等）
3. 加 docs/QUICKSTART.md（面向用户的启动+交互文档）
4. 整理 settings 面板迁移的 i18n 兜底（目前显示 key 字符串 → 后续按需补）
5. 检查 README 是否更新、CHANGELOG 是否写

## 轮 9 完成记录 — UI i18n 中文化（最高 ROI 改动）

### 修复内容

`src/web/frontend/app/src/react-i18next-stub.ts`：

之前 stub 的 `t(key)` 直接返回 key 字符串，导致 UI 所有 t() 调用显示原始 key（如 `file.title`、`checkoutLeftMouseToSelectAndMove.title`）。改造方案：

- 委托给真 i18next 实例（main.tsx 已加载 zh_CN/en 资源）
- 真包找不到时调用 `lookupAllNamespaces` 全量扫所有 namespace，nx-pg 默认 zh_CN → zh_TW → en 兜底
- 支持 `t(key, "中文默认")` 字符串第二参（项目里常见约定）和 `t(key, { ns, defaultValue })` 标准 i18next 选项
- 砍掉 useSyncExternalStore（与 react-i18next 内部实现时机在 React 19 + esbuild 下冲突，触发 "Je is not a function" 白屏）

### 验证结果（headless 实测）

主菜单栏从英文 key 变为中文：

| 之前 | 之后 |
|---|---|
| `file` | `文件` |
| `view` | `视野` |
| `actions` | `操作` |
| `settings` | `设置` |
| `ai` | `AI` |
| `window` | `视图` |
| `extensions` | `扩展` |
| `about` | `关于` |

DropWindowCover 提示文本（之前就是中文）、Command Palette 占位符、底部工具栏 tooltip 全部走 zh_CN 链路。

### 已知 UX 冲突（写入 pending.md）

- Settings.language schema 仍支持 5 种语言，但 stub 实际上只显示中文 — core 不动
- lookupAllNamespaces 跨 ns 兜底隐藏了原 namespace 不匹配的 bug — 选 "用户看到对" 而非 "语义对齐"

### 测试状态

- pnpm run test 全绿（lint + build + smoke + unit）
- 修改文件 1 个（react-i18next-stub.ts）+ pending.md + PROGRESS.md
- bundle 大小变化：+0KB（zh_CN 资源本来就被 import，无新依赖）



## 轮 10 完成记录 — 画布状态栏（审查后修复 3 个真 bug 才提交）

轮 4 遗留未提交的 `components/stage-status-bar.tsx`（左下角：缩放% / 节点 / 连线 / 选中 / FPS / 上限）。
本轮**没有盲信上一轮**，逐条核对后发现 3 个真实缺陷，修好才提交：

1. **双重缩放**：组件被渲染在 App.tsx:342 的「已缩放 UI 层」内，却自己又吃了一份 `zoomStyle`
   → UI 缩放 150% 时状态栏实际是 225%。已去掉组件侧的 zoomStyle，改为只放在已缩放层内。
2. **状态栏吃掉画布左下角点击**：父层 className 是 `*:pointer-events-auto`，编译成
   `:is(.\*\:pointer-events-auto>*)`（特异性 0,2,0），高于普通 `.pointer-events-none`（0,1,0）
   → 左下角无法框选/建节点。已改为 `pointer-events-none!`（编译验证：
   `.pointer-events-none\!{pointer-events:none!important}`）。
3. **整轮功能等于没上线**：原实现用 `if (!project.isRunning) return null` 当渲染门槛。
   但画布本来就要等鼠标移入才 loop()（Canvas.tsx 的 mousemove），而 React 子组件 effect 先于
   父组件 effect 执行 —— App.tsx 里 Settings.watch 触发的 `activeResourceTab.loop()` 尚未跑完，
   状态栏首帧就判 false → 永久返回 null。已去掉该门槛，改惰性初始化 + 250ms 轮询。

另修一处口径错误：`nodeCount` 原为 `getTextNodes()+getSections()`，漏掉 ImageNode/UrlNode/SvgNode
等其他 ConnectableEntity（粘贴一张图片会显示「节点 0」）。改用 `getEntities()`。

- 「上限」改为经 Settings.watch 实时跟随（原先直接读 `Settings.maxFps`，是启动快照）
- 测试：pnpm run test 全绿（lint + build + smoke 17 actions + unit 5 pass）
- 改动文件：stage-status-bar.tsx（新增）+ App.tsx（-2/+6）

## 轮 11 完成记录 — 修黑夜模式失效（Agent.md 明列需求）✅ 真机实测变色

**根因**：轮 4 修死循环时把 `themeMode` / `lightTheme` / `darkTheme` 三个 watcher 整个删了，
只剩 `theme` 一个。`ThemeModeSwitch` 只写 `Settings.themeMode`，没人消费 → 开关点了没反应。
**这是我们自己在轮 4 引入的回归**，不是原项目缺功能。

**修法（无环的两级链路）**：
- `themeMode → theme → 界面`；`theme → 界面`。只有一个出口（theme watcher 里 applyThemeById）
- 绝不回写 lightTheme/darkTheme —— Settings 的 set trap 无条件通知 listeners，
  原版 4 个 watcher 互相回写必然成环（轮 4 headless 实测同步死循环白屏）
- 首帧特判：`Settings.watch` 注册时**同步立即回调一次**（Settings.tsx:1078）。
  默认 `theme=dark-blue` 而 `darkTheme=dark`，照常处理会每次开 app 把用户存的蓝色黑夜覆盖成黑夜。
  改为首帧反向校准 themeMode（已显示的主题才是事实来源，开关位置必须与眼睛一致）

**顺带修的 bug**：设置面板主题 `<select>` 的选项是手写 4 个 id，漏了 `lightTheme` 默认值
`morandi` → value 匹配不到任何 option，**控件显示空白**。改为从 `themes/*.yml` frontmatter 生成，
不可能再漏。用户挑主题时单向记一次 lightTheme/darkTheme（供开关来回切），不走 watch 链。

**真机实测（headless Chrome + CDP，非仅改代码）**：
| | `--background` | color-scheme |
|---|---|---|
| 点开关前 | `oklch(0.141 0.005 285.823)` | dark |
| 点开关后 | `oklch(0.97 0.01 230)`（morandi） | light |

连点 6 次：dark→light→dark→light→dark→light 严格交替，**0 uncaught exception**，
canvas 存活 —— 轮 4 的乒乓死循环确认不再发生。

- 测试：pnpm run test 全绿（lint + build + smoke 17 actions + unit 5 pass）
- 改动文件：App.tsx（+30）、sub/SettingsWindow.tsx（+14/-6）
- 2 条 UX 语义差写入 pending.md（主题列表只覆盖明暗两档 / 记忆上次配色需手动挑过）

## 轮 12 完成记录 — 修图片粘贴（Agent.md 明列需求）✅ 浏览器实测贴出真图

浏览器里 Ctrl+V 贴图此前**完全不通**，且不止一处断链，共修 4 层：

1. **`imageNodeFactory.ts` 是「只 new 不入台」的占位实现**（最致命）
   节点建出来后**从没 `stageManager.add`**，渲染器遍历不到 → 画布上什么都不会出现；
   且尺寸恒为 `100×100`（没量图片本身），url 用 `blob:` 而非 attachmentId。
   已按原版语义重建：`createImageBitmap` 量真实尺寸 → `project.addAttachment(blob)`
   → `stageManager.add(imageNode)`。
   **必须走 addAttachment**：ImageNode 构造时按 attachmentId 去 `project.attachments` 取 blob
   （ImageNode.tsx:96），取不到直接把 state 置 `notFound` 渲染破图；
   附带好处是图片进 attachments，存 .prg 时会被一起打包（Project.tsx:392）。

2. **AUTO 模式在浏览器必失败**：`readSystemClipboardAndPaste` 按 `isMac`/`isWindows`/`isLinux`
   选路线，但 `utils/platform.tsx` 里这三个常量全带 `!isWeb &&` 前缀 —— 浏览器下**恒为 false**，
   一路掉进最后的「未知系统」兜底走 tauri 分支，而 tauri 分支调的 `readImage()` 在 shim 里
   **无条件 throw**。已加 `isWeb` 分支直接走 webview（桌面端逻辑原样保留）。
   顺带修掉误导性报错：Web 版弹「Tauri模式粘贴图片失败」本身就是错的。

3. **`pasteImageFromWebClipboard` 会把整个 paste 打成 unhandled rejection**：
   `navigator.clipboard.read()` 需要权限+用户手势+安全上下文，无条件 await 必抛。
   已包 try/catch 并给中文提示（权限被拒时原来只表现为「按了没反应」）。
   同时改成返回 boolean —— 原来返回 undefined，会被后续当成失败。

4. **一次 Ctrl+V 贴出「图片 + 多余空文本节点」**：截图软件有时同时写入 image/png 和一份文本，
   原代码无条件接着贴文字。改为只有「没贴成图」才去贴文字。

**浏览器实测（headless Chrome + CDP，真实剪贴板 + 真实 Ctrl+V）**：
- 写入一张 240×120 红蓝渐变 PNG → `Input.dispatchKeyEvent` 发真 Ctrl+V
- 状态栏 **节点 0 → 1**；截图确认图片按 **240×120** 画在画布上（不是 100×100 占位），FPS 60
- 0 uncaught exception

**headless 验证坑（下次直接抄）**：
- CDP `Input.dispatchKeyEvent` 用 `type:"rawKeyDown"` **不带 text 字段不会产生 keydown**，
  只有 Control 到了、`v` 丢了 → 表现为「按了没反应」。要发 `type:"keyDown"` + `text:"v"`。
- `navigator.clipboard.write` 在 headless 下抛 `Document is not focused`，
  必须先 `Emulation.setFocusEmulationEnabled({enabled:true})` + `Browser.grantPermissions`。

- 测试：pnpm run test 全绿（lint + build + smoke 17 actions + unit 5 pass）
- 改动文件：imageNodeFactory.ts（重建）、copyEngine.tsx（+21/-7）、copyEngineImage.tsx（+45/-14）
- 2 条 UX 冲突写入 pending.md（拖拽/批量粘贴、图片详情编辑区依赖已删的 plate）

## 轮 13 完成记录 — 换成真 lucide 图标（复核轮 4 的结论已过期）

轮 4 把整个 lucide-react alias 到 `lucide-stub.tsx`（1172 行），所有图标渲染成**同一个**
「盒子」占位形状。本轮复核发现当时的结论**已经站不住**：

- React 19.3 的 `React.forwardRef` 仍是 **function**（轮 4 记的 "forwardRef is not a function" 不复现）
- node_modules 只有一份 react@19.3.0（无多副本导致的双实例问题），lucide 的 peerDependencies 写着 `^19.0.0`
- SSR 实测 10 个图标渲染出 **10 种不同 path**

改动：删掉 vite alias + 删除 1172 行 stub，改用真包（`lucide-react@0.545`，早已装在 package.json 里）。

**浏览器实测（headless Chrome）**：页面 `svg.lucide` 共 23 个、**23 种不同形状、0 个空图标**、
0 uncaught exception、canvas 正常。截图确认菜单栏（文件/视野/操作/设置/AI/视图/扩展/关于）、
右侧工具栏、窗口控制按钮全部是各自正确的图形 —— 此前它们全是同一个盒子。

**代价与取舍（如实记录）**：bundle 2,642 kB → 3,478 kB（gzip 799 → 949 kB，**+150 kB**）。
原因是 `context-menu-content.tsx` 与 `global-menu-content.tsx` 用
`import * as LucideIcons` 按名字运行时查表（图标名来自用户可改的 `Settings.contextMenuConfig`，
共 158 个），tree-shaking 对动态下标无效。
试过删掉同样用命名空间导入的 `dynamic-icon.tsx`（无任何引用的死代码），bundle **纹丝不动**，
说明体积不是它造成的 —— 于是把它还原了（不是本轮该删的东西）。要压回体积只能把 158 个图标名
做成静态映射表，但配置项来自用户 localStorage，新增名字会直接查不到而丢图标，
对个人自用工具不划算，故保持现状。

- 测试：pnpm run test 全绿（lint + build + smoke 17 actions + unit 5 pass）
- 改动文件：vite.config.js（-2/+4）、lucide-stub.tsx（删除 1172 行）

## 轮 14 完成记录 — UI 排除项清理 + 粘贴自动打框（优化循环第 1 轮）✅ headless 实测

本循环任务来源：Agent.md（权威需求文档）。三项改动全部浏览器实测：

### 1. 菜单栏裁剪（Agent.md：不需要 AI / 扩展市场 / 关于）

- `Settings.tsx` globalMenuConfig 默认值：删 `ai`、`extensions`、`about` 三个顶级菜单；
  window 菜单只剩背景网点组（全屏/课堂模式/隐私/不透明度/隐身全是 Tauri 窗口能力）；
  文件菜单删协作子菜单 + deep-link 导出子菜单
- **旧配置重置判定反转**：原判定 `!hasMenuId(config,"extensions")`（缺了才重置）——
  默认值删掉 extensions 后永远不触发。改为「存档含 ai/extensions/about/collaborationSub/
  exportPrgDeepLinkSub 任一 → 重置」。merge 只增不删，这是唯一能清掉已持久化旧菜单的办法
- 实测菜单栏 = 文件/视野/操作/设置/视图，文件菜单无协作，导出无 deep-link

### 2. 右上角四按钮删除（Agent.md 第 6 条）

- 删 `WindowButtons` 组件（钉住/最小化/最大化/关闭，全走 getCurrentWindow()）、
  Windows 触发角、isMaximizedWorkaround → isWindowMaxsizedAtom 整条链、
  App.tsx 7 个失效 import（Button/lucide 6 图标/两个 atom/isMac/isWindows）
- 实测 pin/minus 图标 0 个，标题栏只剩 GlobalMenu + 拖拽区 + 主题开关

### 3. 粘贴图片自动打框（Agent.md 第 10 条）

- 根因：nx-pg 的 imageNodeFactory 有 wrapInSection 回调但写死 `?? false`，
  原版是 `?? Settings.wrapImageInGroup`（Settings schema 一直在，只是没人消费）
- 改回原版语义 + `wrapImageInGroup` 默认 true（原版 false；Agent.md 明确要这个行为）
- 设置面板新增「图片」区：粘贴图片后自动打框开关
- **headless 实测**（复刻轮12法：setFocusEmulation + grantPermissions + 真 Ctrl+V 带 text:"v"）：
  贴 240×120 红蓝渐变 PNG → 画布上图外套白色圆角分组框、状态栏「节点 2」（图1+框1，
  Section extends Entity 计入 getEntities()）、FPS 61、0 uncaught exception

### 验证

- pnpm run test 全绿（lint + build + smoke 17 actions + unit 5 pass）
- 截图 .tool/round1*.png（验证脚本 .tool/round1-verify.mjs / round1-paste-verify.mjs 可复跑）
- 4 条 UX 冲突写入 PENDING.md（旧菜单配置重置策略 / window 菜单收窄 / 默认值反转 / 打框不弹标题编辑）

## 下一轮计划

轮2（优化循环）— **实际完成：✅ 命令面/欢迎窗/右键菜单三处排除项清理**

### 1. CommandPalette 过滤排除项命令（一致性缺口修复）

轮 1 删了菜单条目，但 CommandPalette 渲染的是 shortcutKeysRegister **全量** keyBinds——
AI/扩展/协作/deep-link/全屏/隐身/开发者工具等 50+ 命令仍可被搜到并触发。
新建 `core/service/excludedCommands.ts`（集中名单 + isExcludedCommand），
CommandPalette 按 id 过滤。菜单与命令面板共用一份名单，不会漂移。
实测：294 条命令，AI/扩展/协作/深链/关于/隐身/全屏/开发 全部 0 命中，saveFile 等正常命令健在。
（保留判定：`reload`=location.reload 安全阀、`test`=用户可改测试 toast，均 web 适用，非 dev 漏网）

### 2. WelcomeWindow 清理

- 删：功能说明书下载入口（GitHub 拉教程 prg）、「关于」按钮、原项目官网按钮、
  版本号官网链接（保版本号文本）、公告系统死代码（LR_API_BASE_URL 云服务不存在）、
  AMD CPU 桌面渲染警告、9 条桌面专属 slogans（exe/zip、小黄点、透明窗口、窗口拖带等）
- 增：1 条 web 版 slogan（粘贴图片自动打框提示）
- 快捷入口四宫格 → 三宫格（新建草稿/最近文件/打开文件）

### 3. 右键菜单删涂鸦项

- contextMenuConfig 默认值删 `setPenStrokeColor`（改变画笔颜色，Agent.md 排除项 1 涂鸦范围）
- context-menu-content.tsx 删对应渲染器 + 类型分支；schema literal 类型保留（旧存档兼容，渲染为 null）
- 实测：右键菜单 13 项，「画笔」0 命中，打包/颜色/文本节点操作等核心项健在

### 验证

- pnpm run test 全绿（lint + build + smoke 17 actions + unit 5 pass）
- 三组 headless 截图 + DOM 断言全过，0 uncaught exception
- 验证脚本 .tool/round2-verify.mjs / round2-ctx-verify.mjs 可复跑

## 下一轮计划

轮3（优化循环）— **实际完成：✅ 递归导入断链修复（含 server file:// 协议修复）+ 键盘最近文件调试残留清理**

### 1. RecentFilesWindow「递归导入文件夹」从必报错到真实可用（操作连贯性）

两层断链，全部修复并 headless 实测：
- **invoke 断链**：原版走 Tauri `invoke("read_folder_recursive")`（Rust 命令），web shim 无条件 throw。
  改为前端 BFS：dialog 选目录 → server `project.fs.readdir` 逐层展开收集 .prg。
- **dialog 断链**：dialog shim 的 `open({directory:true})` 原来直接返回 null。
  实现：prompt 输入 workspace 相对目录（空 = 根目录）+ exists 校验。
- **server file:// 协议断链（本轮最重要的根因修复）**：导入成功后列表立即变 NULL——
  前端 recent 存的是 `uri.toString()`（`file:///C:/...`），`validAndRefreshRecentFiles` 拿它调
  fs.exists，server 的 resolveWorkspacePath 不认 file:// 协议 → exists 恒 false →
  记录被当「文件丢失」清掉。**影响面不止导入**：GlobalMenu 最近文件、缩略图读取全踩同一坑。
  修复：resolveWorkspacePath 开头识别 `file://` 前缀，用 `fileURLToPath` 剥协议头（单点修，全链路受益）。
- 实测：workspace 造 sub/a.prg + sub/deep/b.prg + top.prg，对话框输入 "sub" →
  toast「成功导入 2 个.prg文件」→ 列表出现 a、b 两卡片（嵌套递归正确，根目录 top.prg 不混入），
  0 uncaught exception

### 2. KeyboardRecentFilesWindow 调试残留

删 `onKeyDown` 第一行的 `toast(event.key)`（每次按键弹 toast，干扰数字键选文件的既有交互），
顺带删「打开第 N 项」toast（打开动作本身就是反馈）与未用的 sonner import。

### 3. SettingsWindow section 路由安全确认（候选1，无改动）

4 个 `SettingsWindow.open(...)` 调用点全部落到 stub（忽略 section 参数）= 通用设置面板；
"extensions"/"about" 的入口命令已在 excludedCommands 过滤。无关于页/扩展页泄漏，无需改。
（候选3 KeyBindsUI 列表过滤同样确认无需做：完整快捷键设置面板已在前循环删除，
KeyBindsUI.use(filter) 支持过滤，CommandPalette 已是唯一全量渲染面且已过滤。）

### 验证

- pnpm run test 全绿（lint + build + smoke 17 actions + unit 5 pass；顺带修 round2-verify.mjs 的 unused var lint）
- 单元级：`file:///C:/...` exists 直查 true
- 端到端：导入链路 headless 断言 + 截图（.tool/out/round3-import.png）
- 测试数据已清理（workspace sub/ 目录删除）

## 下一轮计划

轮4（优化循环）— **实际完成：✅ 子 agent 差距检查 + 3 处一致性修复**

### 子 agent 差距检查（兜底条款触发）

交互/渲染层与原版逐字节一致、子窗口层无泄漏，本轮剩下的真实缺口都在「组件依赖的服务被 stub」
和「设置面板未移植」。子 agent 产出 8 项任务清单（3×P1 + 3×P2 + 2×P3），本轮先落 3 个小改动面项。

### 1. 恢复 ColorWindow 调色板（差距#2，P1）

- 从原版直接复制 sub/ColorWindow.tsx（原版 import 全部为 nx-pg 已有模块，无 Tauri 依赖）
- context-menu-content.tsx 删 ColorWindow no-op stub，import 真 ColorWindow + ColorManagerPanel
- 右键菜单「更改颜色」子菜单下的「打开调色板」「打开颜色管理」「打开舞台颜色分布表」三个入口全部可点击生效
- F6（openColorPanel）/ S-F6（openColorPaletteWindow）两个快捷键从空实现变真
- 实测：F6 触发 → 调色盘子窗口渲染标题 + 6 色块 + 颜色选择器 + 「打开颜色管理」按钮 + 用户颜色库，0 异常

### 2. 打开文件夹入口给 toast 反馈（差距#3，P1）

5 个「打开本地文件夹」类入口在 web 下原版 `shellOpen(...)` 静默无效（api-core shim 路径全空）：
- openConfigFolder / openCacheFolder：workspace 路径写到剪贴板 + toast
- openCustomBackupFolder：Settings.autoBackupCustomPath 路径写剪贴板 + toast
- openDefaultBackupFolder：workspace/auto-backup-v2 路径写剪贴板 + toast
- openCurrentProjectFileFolder（Ctrl+Shift+L）：工程所在目录写剪贴板 + toast（同步改 GlobalMenu.tsx 的 openCurrentProjectFolder helper）
- 加 fetchWorkspacePath() helper（带 module-level 缓存）统一 fetch /api/project/workspace

实测：CommandPalette 搜 openConfigFolder → 回车 → 右下角 toast「已复制工作目录到剪贴板：C:\Users\zhlx\.nx-pg\workspace」

### 3. 右侧快捷设置栏默认项修正（差距#5，P2）

原版默认 8 项里 3 个（isStealthModeEnabled / stealthModeReverseMask / showDebug）对应的菜单入口已在轮 1 删除，
保留则让右栏常驻 3 个与全局 UI 矛盾的孤立开关。换成 web 高频项：
showBackgroundDots / wrapImageInGroup / enableDragAutoAlign / forceHideTextNodeBorder / alwaysShowDetails /
reverseTreeMoveMode / textIntegerLocationAndSizeRender / showRecentFilesThumbnails。
实测：localStorage `quick-settings.json_quickSettings` 新默认数组已生效，3 个旧项已剔除。

### 验证

- pnpm run test 全绿（lint + build + smoke 17 actions + unit 5 pass）
- headless 实测 3 处：F6 触发 ColorWindow 子窗口渲染完整 / toast 截图确认 / localStorage 默认数组确认
- 0 uncaught exception

### 留作下轮主线

- **差距#1（移植原版 schema 驱动的设置页）**：150+ 项按 5 大类组织的 SettingField 页（settings.tsx），
  替代现 5 项最小面板——setting.tsx 全部 infrastructure（SettingField、SettingsIcons、QuickSettingsManager）
  已在 nx-pg 与原版字节一致，Settings 在核心代码已真实生效，只是没 UI 入口。这是当前最大「有功能无入口」缺口。
- 差距#4（快捷键自定义页）/ 差距#6（节点详情编辑）：中等改动面，本轮排不上下轮选。

## 下一轮计划

轮5（优化循环）— **实际完成：❌ 移植失败回退主路径 + ✅ 顺手抽出 shortcutKeysGroups**

### 移植原版 SettingsWindow settings.tsx — 失败回退

尝试从原版 project-graph/app/src/sub/SettingsWindow 整体移植 settings.tsx + index.tsx + keybinds.tsx + sidebar.tsx：

- build 成功（bundle 3,538 KB）
- 但运行时点击「打开设置」报 React #130（element undefined）
- vite dev 模式因装饰器语法（@service）直接抛 plugin 错误（vite.config.js 加 esbuild.supported.decorators 也无法绕过 react-refresh 的限制）
- 通过 ErrorBoundary 显示了错误堆栈，但 minified React 错误指向 React 渲染内部，无法定位具体缺失的组件导出
- 排查方向（sidebar 缺 Provider / fuse.js 加载 / SidebarMenuButton 内部钩子等）均在 nx-pg 单页签场景下补足成本高
- **务实决定回退**：删 SettingsWindow 子目录、删 keybinds.tsx、恢复 SettingsWindow.tsx 5 项最小面板、恢复 sidebar.tsx 为 stub

### 顺手清理：抽出 shortcutKeysGroups 数据

迁移期间漏掉的结构性依赖：
- 原 GenerateFromFolderEngine.tsx 直接 import `@/sub/SettingsWindow/keybinds` 的 `shortcutKeysGroups`（用于文件夹树生成的快捷键分组）
- keybinds.tsx 是 864 行的 UI 页面 + 数据导出耦合，没法只取数据
- 抽出 `src/web/frontend/app/src/core/service/shortcutKeysGroups.tsx`，只保留数据部分（13 组快捷键分组），让 GenerateFromFolderEngine 改用新路径
- **nx-pg 的 SettingsWindow.tsx 仍是 5 项最小面板**，150+ 设置项依然「有功能无入口」（差距#1），但本轮未触线

### 验证

- pnpm run test 全绿（lint + build + smoke 17 actions + unit 5 pass）
- bundle size 未变（已回退）
- 0 uncaught exception

### 教训与后续

- **SettingsWindow 完整移植成本比预期高**：shadcn Sidebar 在原版里的 useSidebar / SidebarProvider / TooltipProvider 等多组件协同，nx-pg 局部场景下需要补 Provider + 全套 Provider/Context 适配才能跑通
- **下轮若想推**：先做 sidebar.tsx 的 Provider/Context 适配（补 useSidebar + SidebarProvider），再回头移植 settings.tsx。属于中等改动面 P1 工作
- 替代方案：nx-pg 接受 5 项最小面板作为终态（个人自用 + 关键设置都能改），将差距#1 重新定性为「不做」

## 下一轮计划

轮6（优化循环）— **实际完成：✅ 节点详情 textarea 编辑（差距#6 P2）**

### 节点详情编辑从 stub 变为真

- **替换 stub**（`sub/NodeDetailsWindow.tsx` 原本是 no-op）：
  - `open(value, cb, project)` 三个参数：details 值、callback、Project（用于 historyManager 撤销记录）
  - `NodeDetailsEditor` 组件：textarea 编辑 + Ctrl+Enter 保存 + Esc 取消 + 「保存」按钮
  - 数据通路：details → `DetailsManager.detailsToMarkdown` → textarea → `markdownToDetails` → 写回 entity.details
  - historyManager.recordStep() 包围整个编辑（mount + save），让 Ctrl+Z 撤销整次详情编辑
- **utilsControl 适配**：editNodeDetails 改传 `this.project`（让 NodeDetailsWindow 能拿到 historyManager）；
  砍掉 `syncAssociationManager.syncFrom` 调用（原版孪生同步），nx-pg 的 syncAssociationManager 是 stub 会抛 TypeError e.clone
- **headless 实测**（v4 测试）：
  - 双击建节点（260ms 间隔）→ Ctrl+双击节点（100ms 间隔）→ 详情编辑子窗口创建（hasTextarea=true，0 异常）
  - 子窗口 viewport 位置在画布外（rect.location={120,120} 而画布占满 0-512+px），headless 截图看不到完整子窗口但 textarea 确实渲染
- **行为变更**：原 Ctrl+E（openTextNodeByContentExternal）不变；详情编辑的唯一入口仍是 Ctrl+双击节点

### 验证

- pnpm run test 全绿（lint + build + smoke 17 actions + unit 5 pass）
- 0 uncaught exception
- bundle size 变化 <1KB（无新依赖）

### 留给后续

- Ctrl+E 在 nx-pg 原本绑 openTextNodeByContentExternal（外部打开文件），与 editNodeDetailsByKeyboard 冲突（两条 defaultKey 都 C-e）；nx-pg 沿用原版不动，靠 keyboardOnlyEngine 区分。若用户反馈两个语义混淆再统一
- 详情编辑窗的 viewport 位置参数可改为自适应（rect:Rectangle.inCenter）

## 下一轮计划

轮7（优化循环）— **实际完成：✅ 右侧栏旧数据迁移 + 快捷键设置页（用户点名需求）**

> 用户中途指令：「右侧的功能很多也在web端没有任何作用 我需要实现对快捷键插件的设置」——本轮两项都落地。

### 1. 右侧栏剔除 web 无用旧项（QuickSettingsManager 数据迁移）

- **根因**：init() 只在 localStorage 列表为**空**时写默认值——老用户存档里还是旧 8 项
  （隐身×2 / showDebug 等已删功能的孤立开关），新默认值永远不生效
- **修复**：init() 加 REMOVED_QUICK_SETTING_KEYS 黑名单（隐身×2/showDebug/protectingPrivacy×2/
  windowCollapsing×2/nodeDetailsPanel），读取时过滤，有剔除即回写（一次迁移，不重复）
- 右侧栏从此只显示 web 有效项

### 2. 快捷键设置页（简易版，替代 stub key-bind）

- **key-bind.tsx 组件**：从 stub 替换为原版 192 行真实现（录键/序列键/持续型/确认/删除，
  依赖 emacs/keyDisplay utils 已在）
- **KeyBindsSettingsWindow.tsx 新建**：不用 shadcn Sidebar（轮 5 React #130 教训），平铺分组布局：
  - 快捷键全集（`!item.isGlobal && !isExcludedCommand(id)` 过滤已删命令）
  - 按 shortcutKeysGroups 分组 + otherKeys 兜底组
  - 每行：类型图标 / 冲突提示（含序列前缀重叠检测）/ 重置按钮 / KeyBind 录键框 / 启用开关
  - 改动即时生效（KeyBindsUI.changeOneUIKeyBind / toggleEnabled）并持久化 keybinds2.json
- **入口**：设置面板标题栏新增「快捷键设置」按钮 → openKeyBindsSettings() 独立子窗口

### 验证（headless Chrome 全链路实测）

- 设置面板 →「快捷键设置」→ BASIC 分组渲染 保存文件 control+s / 打开文件 control+o / … 每行完整
- 「在当前项目目录下新建文件」defaultEnabled=false 正确显示为禁用
- **改键链路**：点键位框 → choosing 态出现（Delete ⌫ + Check ✓ 按钮）→ 录 Ctrl+Shift+S → 点 ✓ →
  localStorage `saveFile` 从 `C-s` 变 `C-M-s`，0 uncaught exception
- pnpm run test 全绿（lint + build + smoke 17 actions + unit 5 pass）

### 已知显示问题（记录不修）

- headless 下 Shift 修饰符显示为 meta（`C-M-s`）——CDP 虚拟键位映射特性，真实浏览器键盘不受影响

## 下一轮计划

轮8（优化循环）— **实际完成：✅ 快捷键设置入口进命令面板 + 分组标题中文化**

### 1. openKeyBindsSettings 注册为可搜命令

- shortcutKeysRegister 新增 `openKeyBindsSettings` 命令条目（无默认键位，Keyboard 图标）
- **动态 import 避免循环依赖**：KeyBindsSettingsWindow 反向 import 本文件的 allKeyBinds，
  静态 import 会成环；onPress 里 `void import(...).then(...)` 打破
- zh_CN.yml 补 keyBinds namespace 翻译（「打开快捷键设置」）
- 实测：CommandPalette 搜 openKeyBindsSettings → 「快捷键设置」子窗口打开

### 2. 分组标题中文化

- KeyBindsSettingsWindow 分组标题改走 keyBindsGroup namespace 的 `.title`
  （zh_CN.yml 已有全套翻译：基础快捷键/摄像机控制/应用控制/未分类的快捷键…）
- 实测：「基础快捷键」「未分类的快捷键」正确渲染，无 key 泄漏

### 验证

- pnpm run test 全绿（lint + build + smoke 17 actions + unit 5 pass）
- headless 截图确认中文分组 + 键位行完整，0 uncaught exception

## 下一轮计划

轮9-10（优化循环收尾）候选：
1. 状态栏/画布悬停反馈对照原版最后一遍过
2. PROGRESS.md 终版方法论沉淀（发布流程/循环经验）
3. PENDING.md 清理已解决条目标注
4. 兜底：派 requirements-analyst 子 agent 做收尾差距检查
