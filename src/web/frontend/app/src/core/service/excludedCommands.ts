// nx-pg：Agent.md 排除项的**命令 id** 集中名单。
// 菜单栏（globalMenuConfig）已物理删除对应条目；但 CommandPalette / KeyBindsUI
// 渲染的是 shortcutKeysRegister 的全量 keyBinds，需要按 id 过滤才能与菜单一致。
// 维护约定：凡因「web 化排除」（AI/扩展/协作/教程/桌面窗口能力/deep-link/开发者工具）
// 而从 UI 移除的命令，id 都加到这里，CommandPalette 等全量渲染处统一引用。

export const EXCLUDED_COMMAND_IDS = new Set<string>([
  // ---- AI（Agent.md 排除项 2）----
  "openAIPanel",
  "openAITools",
  // ---- 扩展系统 / 市场（排除项 3 / 8）----
  "openExtensionsWindow",
  "openPluginMarket",
  "openExtensionFolder",
  // ---- 关于 / 教程 / 官网（排除项 7）----
  "openAboutWindow",
  "openOfficialDocs",
  "downloadTutorialMain",
  "downloadTutorialShortcutKeys",
  "downloadTutorialLogicNodes",
  "watchBilibiliVideo2",
  "watchBilibiliVideo1_6Basic",
  "watchBilibiliVideo1_6Advanced",
  "watchBilibiliVideo1_0",
  "watchBilibiliVideoPyQtUpdated",
  "watchBilibiliVideoPyQt",
  "showUpgradeGuide",
  // ---- 协作 / 云服务 ----
  "startCollaboration",
  "joinCollaboration",
  "openCollaborationPanel",
  "openCursorChat",
  "leaveCollaboration",
  // ---- deep-link（Tauri 桌面协议）----
  "exportCurrentViewPrgDeepLink",
  "exportSelectedEntityPrgDeepLink",
  "exportCurrentFilePrgDeepLink",
  // ---- Tauri 桌面窗口能力（web 化无意义，浏览器自有控制）----
  "toggleFullscreen",
  "toggleWindowMaximize",
  "setWindowToMiniSize",
  "checkoutWindowOpacityMode",
  "windowOpacityAlphaIncrease",
  "windowOpacityAlphaDecrease",
  "windowOpacitySub",
  "checkoutClassroomMode",
  // ---- 隐身模式（Tauri 窗口级像素掩码，web canvas 无对应物）----
  "switchStealthMode",
  "toggleStealthModeReverseMask",
  "stealthModeScopeRadiusIncrease",
  "stealthModeScopeRadiusDecrease",
  "stealthModeSub",
  // ---- 开发者 / 不稳定版本工具 ----
  "devOpenTestWindow",
  "devSerializeTest",
  "devTriggerBug",
  "devReload",
  "devGetDeviceId",
  "devFeatureFlags",
  "devNodeDetails",
  "devCreateTestTab",
  "devLogStage",
  "devLogSelectedDetails",
  "devCreateExampleExtension",
  "devOutputMarkdown",
  "devOnboarding",
  "devCreate100Nodes",
]);

export function isExcludedCommand(id: string): boolean {
  return EXCLUDED_COMMAND_IDS.has(id);
}
