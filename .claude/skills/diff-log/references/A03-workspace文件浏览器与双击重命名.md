---
name: A03-workspace文件浏览器与双击重命名
description: nx-pg 特化——web 版无系统文件对话框，自建 WorkspaceFilesWindow 浏览 workspace（双击打开/重命名/删除/新建）；tab 双击弹框重命名（rename+uri 同步）；草稿保存弹框起名。触发词：文件浏览器、工作目录、重命名、双击、改名、WorkspaceFilesWindow、草稿保存、untitled。
---

## 特化内容

原版 project-graph 是 Tauri 桌面应用：文件选择走系统对话框，重命名靠文件管理器，草稿保存弹系统保存框起名。web 版 workspace 在 server 端（`~/.nx-pg/workspace`），系统对话框不可用——原 shim 只能 `window.prompt` 列 8 个文件名（模糊、无法浏览、无法改名）。

nx-pg 特化为三件套：

1. **WorkspaceFilesWindow**（停靠左侧子窗口）：server readdir 数据驱动的目录树（懒加载展开、目录折叠）、mtime 时间戳列、筛选框；条目操作 = 双击 .prg 打开 / 重命名（Dialog.input）/ 删除（Dialog.confirm 递归）；顶部 = workspace 路径 + 刷新 + 新建文件夹/新 .prg（名字输入框 + 创建）。入口：全局菜单 文件→浏览工作目录 + CommandPalette（`openWorkspaceFiles` 命令，无默认键位）。
2. **tab 双击重命名**：双击 file 方案工程的 tab 标题 → Dialog.input 改名 → fs.rename → project.uri 更新 → recent 列表旧删新加。draft/collab 排除（draft 提示走 Ctrl+S 起名）。
3. **草稿保存起名**：`plugin-dialog.ts` shim 的 `save()` 从「自动 untitled-<时间戳>」改为先弹 Dialog.input 让用户起名（Dialog 加载失败退回自动起名兜底），重名时间戳兜底保留。

## 实现位置

| 锚点 | 作用 |
| --- | --- |
| `src/web/frontend/app/src/sub/WorkspaceFilesWindow.tsx` | 文件浏览器子窗口（createSubWindow，默认 dockedLeft） |
| `src/web/frontend/app/src/core/subWindowOpenModes.ts` | SUB_WINDOW_IDS + 默认 dockedLeft 登记 |
| `src/web/frontend/app/src/core/service/controlService/shortcutKeysEngine/shortcutKeysRegister.tsx` | `openWorkspaceFiles` 命令（动态 import 防循环依赖） |
| `src/web/frontend/app/src/core/service/Settings.tsx` | globalMenuConfig 文件菜单加 `openWorkspaceFiles` 项 |
| `src/web/frontend/app/src/locales/zh_CN.yml` | `openWorkspaceFiles.title/description` |
| `src/web/frontend/app/src/ProjectTabs.tsx` | `renameProjectByDialog` + tab 标题 onDoubleClick |
| `src/web/frontend/app/shims/plugin-dialog.ts` | save() 弹 Dialog.input 起名 |
| `src/modules/project/index.js` | readdir 条目加 mtimeMs（列表显示修改时间） |

## 关键决策

1. **重命名走弹框不走行内 Input**（用户拍板）：与文件列表重命名交互统一，避开 tab 条内嵌 Input 的宽度/焦点/拖拽冲突。
2. **tab 双击只绑标题 span**，不覆盖整个 tab 按钮：保住原有单击切换、拖拽浮动、中键关闭的管线。
3. **重命名目标存在即拒绝**（不覆盖）：rename 前先 exists 检查，与「用户已有文件永不被覆盖」的追加式约定一致。
4. **shim 的 save() 弹框可失败退回**：Dialog 组件 import 放 try 里，极端时序（模块未就绪）退回自动起名，不阻塞保存。
