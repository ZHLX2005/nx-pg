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

## [轮 11] 设置面板的主题下拉只剩「明/暗两类」，无法挑具体配色
- 文件：`src/web/frontend/app/src/sub/SettingsWindow.tsx`
- 原 project-graph 行为：完整 SettingsWindow 有独立的「外观 / 自定义」分区，可从 10 个内置主题
  （catppuccin 四款 / dark / dark-blue / light / macaron / morandi / park）里任选，
  且每个明暗档位各自记住上次用的那一个（lightTheme / darkTheme 两个设置项）
- 提议 UX：把主题列表补全到全部内置主题，并按「亮/暗」分组或加小色块预览，
  让用户能直接选 morandi / park / dark-blue 而不是只能开合明暗
- 冲突点：原版外观分区属于 plate 富文本 + keybinds 多面板体系的一部分（轮 4 已整体删除），
  重建它等于把删掉的东西搬回来。本轮只修「列表与实际值对不上」这个 bug（下拉显示空白），
  不扩建面板 —— 明暗两档够个人日常用，扩到 10 个属于范围外的功能补齐

## [轮 11] 明暗开关切换时「记住上次用的那档主题」需要用户先在设置里挑过
- 文件：`src/web/frontend/app/src/App.tsx`（themeMode watcher）
- 原 project-graph 行为：lightTheme/darkTheme 由 theme watcher 自动回写，
  即用即存，用户从不需要手动挑
- 提议 UX：同样自动记住（用户开一次亮色主题就记为 lightTheme）
- 冲突点：自动回写正是轮 4 死循环的根因 —— Settings 的 set trap 无条件通知 listeners，
  theme ↔ lightTheme/darkTheme 互相触发成环。本轮改为「只在用户主动挑主题时单向记一次」
  （记在 SettingsWindow 的 onChange 里，不在 watch 链里）。代价是新装用户若从未手动挑过亮色主题，
  首次点开关会落到默认值 morandi 而不是他上次看过的配色。属于可接受的语义差，不改
## [轮 12] 粘贴图片不带「拖拽入画布」与多图批量粘贴
- 文件：`core/service/dataManageService/copyEngine/copyEngineImage.tsx`
- 原 project-graph 行为：`dragFileIntoStageEngine` 支持把图片文件直接拖进画布，
  且一次可拖多个；粘贴时按 `Settings.wrapImageInGroup` 自动包一层分区
- 提议 UX：浏览器端支持拖拽多图入台；粘贴多张时按顺序并排而非叠在鼠标点
- 冲突点：拖拽入台引擎在 nx-pg 里依赖 Tauri 的文件拖放事件（`onDragDropEvent` shim 是空实现），
  补齐等于新增一条数据入口，不属于「让已有按钮能用」的范围。本轮把「粘贴单图能用」修通即可，
  批量与拖拽留作独立迭代

## [轮 12] 图片节点没有详情编辑区
- 文件：`core/service/dataManageService/imageNodeFactory.ts`
- 原 project-graph 行为：ImageNode 的 `details` 是 plate 富文本值，双击可打开图片详情编辑器
  （裁剪、替换、查看元信息）
- 提议 UX：至少给个「双击换图 / 删除」的小面板
- 冲突点：详情编辑器整套依赖 plate（轮 4 已整体删除并 stub 掉）。重建它等于把删掉的
  富文本体系搬回来。本轮只保证「图能贴上、能显示、能随 .prg 保存」，编辑区不重建
