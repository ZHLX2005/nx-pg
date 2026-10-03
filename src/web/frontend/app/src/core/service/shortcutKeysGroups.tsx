// nx-pg：原 SettingsWindow/keybinds.tsx 的快捷键分组数据导出（页面部分未移植：sidebar.tsx
// 在 nx-pg 单页面场景下未启用）。GenerateFromFolderEngine 真用 shortcutKeysGroups
// 生成文件夹树结构，所以这部分数据必须保留。
//
// 复刻自原版 keybinds.tsx:570-起，去掉了 default export 的 KeyBindsPage 与其依赖。
import { ChevronRight, Keyboard } from "lucide-react";
import React from "react";

type ShortcutKeysGroup = {
  title: string;
  icon: React.ReactNode;
  keys: string[];
};

export const shortcutKeysGroups: ShortcutKeysGroup[] = [
  {
    title: "basic",
    icon: <Keyboard />,
    keys: [
      "saveFile",
      "openFile",
      "openCurrentProjectFileFolder",
      "newDraft",
      "newFileAtCurrentProjectDir",
      "undo",
      "redo",
      "releaseKeys",
      "closeAllSubWindows",
    ],
  },
  {
    title: "view",
    icon: <ChevronRight />,
    keys: [
      "resetView",
      "resetViewAll",
      "resetCameraScale",
      "moveViewToOrigin",
      "stopDrifting",
      "focusRandomEntity",
    ],
  },
  {
    title: "mouse",
    icon: <ChevronRight />,
    keys: [
      "mouseLeftMode",
      "doubleClickEmptySpaceAction",
      "enableSpaceKeyMouseLeftDrag",
      "enableDragAutoAlign",
      "reverseTreeMoveMode",
      "mouseWheelMode",
      "mouseWheelModeReverse",
      "mouseWheelWithShiftMode",
      "mouseWheelWithShiftModeReverse",
      "mouseWheelWithCtrlMode",
      "mouseWheelWithCtrlModeReverse",
      "mouseWheelWithAltMode",
      "mouseWheelWithAltModeReverse",
    ],
  },
  {
    title: "textNode",
    icon: <ChevronRight />,
    keys: [
      "textNodeStartEditMode",
      "textNodeContentLineBreak",
      "textNodeExitEditMode",
      "textNodeExitEditModeOnWheel",
      "increaseFontSize",
      "decreaseFontSize",
    ],
  },
  {
    title: "section",
    icon: <ChevronRight />,
    keys: [
      "folderSection",
      "packEntityToSection",
      "unpackEntityFromSection",
      "textNodeToSection",
    ],
  },
  {
    title: "edge",
    icon: <ChevronRight />,
    keys: [
      "createUndirectedEdgeFromEntities",
      "createMTUEdgeConvex",
      "switchEdgeToUndirectedEdge",
      "switchEdgeToArcEdge",
      "createConnectPointFromMouseLocation",
    ],
  },
  {
    title: "select",
    icon: <ChevronRight />,
    keys: [
      "selectAll",
      "deselectAll",
      "invertSelection",
      "selectAtCrosshair",
      "addSelectAtCrosshair",
    ],
  },
  {
    title: "search",
    icon: <ChevronRight />,
    keys: ["searchText", "openTextNodeByContentExternal"],
  },
  {
    title: "camera",
    icon: <ChevronRight />,
    keys: ["switchCameraHeight", "cameraFollowsSelectedNodeOnArrowKeys"],
  },
  {
    title: "tab",
    icon: <ChevronRight />,
    keys: ["clickTabPlusButton", "clickAppMenuRecentFileButton"],
  },
  {
    title: "settings",
    icon: <ChevronRight />,
    keys: ["clickAppMenuSettingsButton", "openAppearanceSettings", "resetAllKeyBinds"],
  },
  {
    title: "advanced",
    icon: <ChevronRight />,
    keys: [
      "checkoutProtectPrivacy",
      "renameStyleFromNode",
      "swapTwoSelectedEntitiesPositions",
      "switchMTUEdgeRenderType",
      "resetMTUEdgeEndpointLocations",
      "copySelectedImageToClipboard",
    ],
  },
];
