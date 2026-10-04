---
name: A04-canvas注入
description: nx-pg 特化——`canvas inject` 把 md 树经注入队列推到用户正在看的画布（前端 2s 轮询 take-all + generateNodeByMarkdown 视野右侧追加、不自动保存）。A02「否决轮询」的定向演进。触发词：canvas inject、注入、实时协作、注入队列、CanvasInjectPoller、inject-queue。
---

## 特化内容

A02 落地时用户拍板「否决轮询/前端桥」，`canvas dag` 只能落新 .prg 再靠 `?open=` 送达——用户不开新文件就看不到内容。后续用户点名新需求：**AI 通过 CLI 把树直接注入当前打开/编辑的画布页面**（不改既有内容、只追加），实现边讨论边推树的实时协作。

nx-pg 特化为「队列 + 定向轮询」通道（不是 A02 否决的「文件变化轮询」——队列是显式协议，无文件监听）：

- **服务端**：`canvas.inject`（POST）解析 md → 只统计节点/边数 → md 原文 push 进 `inject-queue.json`（约束：队列 ≤20 丢最旧、单条 ≤256KB）；`canvas.inject.fetch`（GET）take-all 取走即清空。附带返回面板当前激活画布作提示。
- **前端**：`CanvasInjectPoller` 每 2s GET 一次（页面隐藏暂停、回前台立即拉一次），有条目时对当前激活 Project 调 `generateNodeByMarkdown(md, 视野右缘外侧, true)`——布局交给前端 MarkdownImporter 的 autoLayout（比服务端坐标更贴合当前画布），toast 提示；**不自动保存**（用户 Ctrl+S 决定留存，符合「只注入不修改」）；无画布时 toast 丢弃提示。
- 传 md 原文而非布局坐标是关键简化：CLI 不用算坐标，前端自动排版。

## 实现位置

| 锚点 | 作用 |
| --- | --- |
| `src/modules/canvas/index.js` | `canvas.inject` / `canvas.inject.fetch` 两 action；`inject-queue.json` store |
| `src/web/frontend/app/src/core/service/CanvasInjectPoller.ts` | 2s 轮询 + take-all + generateNodeByMarkdown 注入（模式照 CanvasActiveReporter） |
| `src/web/frontend/app/src/main.tsx` | CanvasInjectPoller.start() |
| `tests/unit/canvas.test.mjs` | inject 队列 take-all / 超长拒绝 2 个用例 |
| `src/web/frontend/app/src/core/stage/stageObject/tools/entityDetailsManager.tsx` | 顺带修复：`markdownToDetails` 曾误实现为实例方法（原版是 static），MarkdownImporter 全链路炸——canvas 注入暴露 |

## 关键决策

1. **对 A02「否决轮询」的定向演进**（非回归）：A02 否决的是「监听文件变化」的盲轮询；A04 是显式注入协议（队列条目有 uuid/时间戳/来源），take-all 消费一次即清，无竞态。仍是零新依赖（node:http + fetch）。
2. **不自动保存**（用户拍板）：注入只改内存态，tab 出现未保存圆点，用户 Ctrl+S 决定留存——agent 不能在用户不知情时改其文件。
3. **注入位置 = 视野右缘外侧**（`getCoverWorldRectangle().right + 100`）：追加语义，绝不覆盖可见内容；MarkdownImporter 生成独立 root 树天然不粘连。
4. **单消费者假设**：take-all 意味着多开面板时先拉到的消费。个人本机一个面板是主场景，不做分发。
5. **修复连带 bug**：`DetailsManager.markdownToDetails` 的 static 形状按原版补回——这不是特化而是回归修复，canvas inject 是第一个走 `generateNodeByMarkdown` 全链路的自动化调用方才暴露（人手点菜单时 detail 内容为空没触发）。
