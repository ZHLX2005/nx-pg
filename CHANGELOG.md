# Changelog

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
- **路径越界**：server `resolveWorkspacePath` 在 Windows 下统一 `toLowerCase()` 比较盘符，修复 vscode-uri `URI.file()` 归一化为小写盘的拦截
- **ProjectOwnership 单进程版**：去掉 Tauri 跨进程 ownership 锁，web 版只保留 attach/activate/saveAs/dispose API + 写盘成功后回写 uri
- **Settings 持久化**：原始 LazyStore → 自制 plugin-store shim（localStorage KV）
