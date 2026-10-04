---
name: A02-CLI-md生成树
description: nx-pg 特化——`nx-pg canvas dag` 从 CLI 传 md/文本，生成排版好的树块 .prg 落到 workspace，页面经 ?open= 打开；人机协作闭环（canvas export/active 反向读回）。触发词：canvas dag、canvas export、canvas active、md转树、生成prg、树布局、人机协作。
---

## 特化内容

原版 project-graph 是纯桌面应用，画布内容只能靠人在界面上手动创建——**没有任何程序化生成入口**。

nx-pg 新增 `src/modules/canvas/` 模块（CLI 与 HTTP 同源），提供「AI/脚本生成内容 → 人到画布看」的人机协作域：

```bash
nx-pg canvas dag "## 根
- 子节点A
  - 孙子1
- 子节点B" [--dir lr|tb] [--name 名字] [--open]
```

- md 多级列表（`#` 标题深度 + 列表缩进）→ 森林 → 树布局（lr 左右 / tb 上下）→ 手写实体 JSON（TextNode+LineEdge）
  → msgpack → zip → `.prg` 落 workspace → 输出可点 URL（`?open=` 让已开面板直接打开）
- `---` 分隔多块 dag 并排；单行块 = 独立节点
- 反向读回：`canvas export --file x.prg --format md|json`（按**形状**识别实体，keepNames 修复前的旧压缩存档也能读）；
  `canvas active` / `canvas active report` 读取/上报面板当前激活文件（前端 CanvasActiveReporter 150ms debounce 自动上报）
- 追加式：生成新 .prg，**不改既有文件**

对应 HTTP action（同源）：`POST /api/canvas/dag`、`canvas export`、`canvas active`（get/report）。

## 实现位置

| 锚点 | 作用 |
| --- | --- |
| `src/modules/canvas/parse.js` | md → 森林：标题深度+列表缩进级、单调栈建树、正文归最近节点、围栏代码块跳过 |
| `src/modules/canvas/layout.js` | lr/tb 树布局：交叉轴子树 span 累加、主轴按深度分层，两轴不重叠保证 |
| `src/modules/canvas/prg.js` | 手写实体 JSON（样板照 ProjectUpgrader）+ msgpack + zip；引用 `{"$":"/i"}`、值类键序、metadata version "2.7.0" |
| `src/modules/canvas/export.js` | .prg → 图/md；按形状识别节点/边；graphToMd 按几何重建层级，环边防死循环 |
| `src/modules/canvas/index.js` | 4 action 注册（CLI+HTTP 同源） |
| `src/web/frontend/app/src/core/service/CanvasActiveReporter.ts` | 前端自动上报激活文件（+ RecentFileManager 顺手 POST recent/add） |
| `main.tsx` | `?open=<workspace 相对路径>` 参数 → onOpenFile |
| `tests/unit/canvas.test.mjs` | 19 个单元测试（parse 6 / layout 4 / prg 2 / action 7） |

## 关键决策

1. **明确否决轮询/前端桥**（用户拍板）：不走「起服务后前端轮询文件变化」，CLI 直接算好布局写 .prg，
   靠 `?open=` URL 一次性送达——web 页只是显示端。
2. **手写 .prg 而非复用前端序列化**：CLI 进程没有浏览器环境；实体样板照 ProjectUpgrader 手拼，
   msgpack+zip 与前端读写格式逐字节兼容。这暴露并促成了 A 系列最大的基建修复——
   **类名压缩 bug**（@graphif/serializer 按 `constructor.name` 注册类，生产 build 压缩后
   `_: "TextNode"` 找不到类；终解是 vite.config.js 本地 20 行插件 `nx-pg-original-class-name`
   注入 `static className`，因 unplugin 原版插件对泛型类有不可绕过的 bug 而自写）。
   **给生产 build 新增任何序列化依赖前先确认该插件覆盖**。
3. **布局只算初值**：尺寸估算（CJK 全宽×1.15）+ 前端 `sizeAdjust:"auto"` 实测重算，两端各管一半。
4. **export 按形状识别而非类名**：兼容历史压缩存档（旧档类名是 `Le` 之类），不依赖 className 修复。

> 相关：A01（同属人机协作域）；路径白名单复用 `src/core/workspace.js` 的 resolveWorkspacePath（模块间禁互依，共享落 core）。
> 演进：本 ref 关键决策 1「否决轮询」针对的是文件变化监听；后续用户点名的**实时注入**（`canvas inject`，显式队列协议）见 A04。
