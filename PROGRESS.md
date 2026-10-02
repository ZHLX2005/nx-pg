# nx-pg 迁移进度（Ralph 循环工作日志）

> 每轮开始先读本文件，收尾必须更新它。参考项目**只读**：`../project-graph/`。

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
