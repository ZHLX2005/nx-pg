# Pending — UX 与 project-graph 原始冲突 / 待跟进

> 此处记录所有「发现 UX 更优但会改变 project-graph 既有行为」的改动。
> 这些不阻塞当前迭代，后续单独排期。

<!-- 由 rp-loop 流程写入。每条格式：
  ## [轮 N] 简述
  - 文件：...
  - 原 project-graph 行为：...
  - 提议 UX：...
  - 冲突点：...
-->

## [轮 9] Settings.language 多语言选项与"只显示中文"不一致
- 文件：`src/web/frontend/app/src/core/service/Settings.tsx:47-49`（settingsSchema.language）
- 原 project-graph 行为：Settings.language 支持 en/zh_CN/zh_TW/zh_TWC/id 五种语言，由用户在设置面板切换；UI 根据 language 渲染对应语言
- 提议 UX：用户明确说 nx-pg 只需要中文 → 把 schema 收敛成 z.literal("zh_CN") 单值
- 冲突点：删掉其他语言 = 删掉 Settings 里所有非中文用户的可访问能力。即使是 core 文件，按当前轮次"稳定功能保留"原则也不动；如果未来要做 i18n stub 完整化再统一处理

## [轮 9] i18next 真包加载与 stub 重复持有语言数据
- 文件：`src/web/frontend/app/src/react-i18next-stub.ts`、`src/web/frontend/app/src/main.tsx:137-149`
- 原 project-graph 行为：react-i18next 在 React 19 + esbuild 下崩溃，用 stub 占位（t 返回 key）
- 提议 UX：stub 通过 lookupAllNamespaces 直接扫 i18next.options.resources，绕过 ns 隔离，让 UI 文本一定显示中文
- 冲突点：lookupAllNamespaces 跨 namespace 兜底 = 隐藏了 namespace 不匹配的 bug；严格按 i18next 设计应改 useTranslation 调用约定（但 core 文件不能改）。当前选择是"显示对用户"，放弃 "对齐原 i18next 语义"

