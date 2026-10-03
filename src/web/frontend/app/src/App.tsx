import MyContextMenuContent from "@/components/context-menu-content";
import FloatingTabs from "@/components/floating-tabs";
import PieMenu from "@/components/pie-menu";
import ThemeModeSwitch from "@/components/theme-mode-switch";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Dialog } from "@/components/ui/dialog";
import { Project, ProjectState } from "@/core/Project";
import { isResourceTab, Tab } from "@/core/Tab";
import { TabWorkspace } from "@/core/TabWorkspace";
import { GlobalMenu, onNewDraft } from "@/core/service/GlobalMenu";
import { flushSettingsLoadErrors, Settings } from "@/core/service/Settings";
import { Telemetry } from "@/core/service/Telemetry";
import { Themes } from "@/core/service/Themes";
import { globalShortcutManager } from "@/core/service/controlService/shortcutKeysEngine/GlobalShortcutManager";
import {
  activeResourceTabAtom,
  activeTabAtom,
  isClassroomModeAtom,
  tabsAtom,
} from "@/state";
import WelcomeWindow from "@/sub/WelcomeWindow";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { arch, platform, version } from "@tauri-apps/plugin-os";
import { restoreStateCurrent, saveWindowState, StateFlags } from "@tauri-apps/plugin-window-state";
import { useAtom } from "jotai";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import CommandPalette from "./CommandPalette";
import { DropWindowCover } from "./DropWindowCover";
import DockedArea from "./components/docked-area";
import RenderOverlays from "./components/overlay-host";
import StageStatusBar from "./components/stage-status-bar";
import { KeyBindsUI } from "./core/service/controlService/shortcutKeysEngine/KeyBindsUI";
import { checkAndFixShortcutStorage } from "./core/service/controlService/shortcutKeysEngine/ShortcutKeyFixer";
import { cn } from "./utils/cn";
import { isLinux } from "./utils/platform";

// tauri-plugin-system-info-api 已 alias 到 shims/tauri-plugin-system-info-api.ts
import { cpuInfo } from "tauri-plugin-system-info-api";

export default function App() {
  const [tabs, setTabs] = useAtom(tabsAtom);
  const [, setActiveTab] = useAtom(activeTabAtom);
  const [activeResourceTab] = useAtom(activeResourceTabAtom);
  // const [isWide, setIsWide] = useState(false);
  const [telemetryEventSent, setTelemetryEventSent] = useState(false);
  const [isClassroomMode, setIsClassroomMode] = useAtom(isClassroomModeAtom);
  const [windowBackgroundAlpha, setWindowBackgroundAlpha] = useState(Settings.windowBackgroundAlpha);
  const [uiScalePercent, setUiScalePercent] = useState(Settings.uiScalePercent);
  // 状态栏要显示 FPS 上限，用户在设置面板改了 maxFps 后得立刻跟着变，不能是启动时的快照
  const [maxFps, setMaxFps] = useState(Settings.maxFps);

  const contextMenuTriggerRef = useRef<HTMLDivElement>(null);

  const handleTitleBarMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.buttons !== 1) return;

    if (event.detail === 2) {
      void getCurrentWindow().toggleMaximize();
      return;
    }

    void getCurrentWindow().startDragging();
  };

  // const { t } = useTranslation("app");

  useEffect(() => {
    // 设置兼容性提示依赖 Dialog UI，必须在应用挂载后再触发。
    void flushSettingsLoadErrors();

    // 先修复老用户的快捷键缓存问题（F11快捷键）
    (async () => {
      await checkAndFixShortcutStorage();
    })();
    // 注册UI级别快捷键
    KeyBindsUI.registerAllUIKeyBinds();
    KeyBindsUI.uiStartListen();

    // 在捕获阶段禁止浏览器/WebView 原生右键菜单，但允许 Radix ContextMenu 处理自己的触发区域。
    window.addEventListener(
      "contextmenu",
      (event) => {
        if (event.target instanceof Element && event.target.closest('[data-slot="context-menu-trigger"]')) return;
        event.preventDefault();
      },
      true,
    );

    // 全局错误处理
    window.addEventListener("error", (event) => {
      Telemetry.event("未知错误", String(event.error));
    });

    // 监听主题样式切换（应用主题 yml → :root CSS 变量 → tailwind token）
    //
    // nx-pg：这里**只做单向的 theme → 界面**，绝不回写 lightTheme/darkTheme。
    // 原版（project-graph/app/src/App.tsx:107-128）有 4 个互相回写的 watcher：
    //   theme → 回写 lightTheme/darkTheme，themeMode → 回写 theme，
    //   lightTheme/darkTheme → 又回写 theme。
    // 但 Settings 的 set trap 会**无条件**通知 listeners（core/service/Settings.tsx:1063），
    // 于是 A 改 B、B 改 A 无限互相触发 —— 轮 4 在 headless 下实测成同步死循环、白屏，
    // 当时把三个 watcher 整个删掉，代价就是「黑夜模式开关点了没反应」。
    //
    // 现在改成无环的两级，语义与原版等价但不可能成环：
    //   themeMode → theme（用户意图：我要亮/暗）→ 界面
    //   theme     → 界面
    // 「记住上次用的亮/暗主题」由 SettingsWindow 在用户**主动**挑主题时单向记一次实现，
    // 不放在 watch 链里，避免任何回边。
    Settings.watch("theme", async (value) => {
      await Themes.applyThemeById(value);
    });

    // 监听主题模式切换（明暗）→ 切到对应的亮/暗主题。
    // 链路只有一个出口：写 Settings.theme，由上面的 theme watcher 统一 applyThemeById。
    //
    // 首帧必须特判：Settings.watch 在注册时**同步立即回调一次**当前值（Settings.tsx:1078）。
    // 那次调用不是「用户切换」，若照常处理会把启动主题强行拽成 darkTheme 的值 ——
    // 默认 theme=dark-blue 而 darkTheme=dark，于是每次开 app 都把用户存的蓝色黑夜
    // 覆盖成黑夜。所以首帧改为「反过来校准 themeMode」：已显示的主题才是事实来源，
    // 开关的位置必须和眼睛看到的颜色一致（否则加载瞬间开关显示「亮」而界面是黑的）。
    let isFirstThemeModeSync = true;
    const unwatchThemeMode = Settings.watch("themeMode", (mode) => {
      if (isFirstThemeModeSync) {
        isFirstThemeModeSync = false;
        const actual = Themes.builtinThemes.find((t) => t.metadata.id === Settings.theme)?.metadata.type;
        if (actual && actual !== mode) Settings.themeMode = actual;
        return;
      }
      const target = mode === "light" ? Settings.lightTheme : Settings.darkTheme;
      if (!target || Settings.theme === target) return;
      Settings.theme = target;
    });

    // 监听窗口背景不透明度
    const unwatchWindowBackgroundAlpha = Settings.watch("windowBackgroundAlpha", (value) => {
      setWindowBackgroundAlpha(value);
    });

    // 初始化 UI 缩放（只缩放 UI 组件层，不缩放 Canvas 画布）
    setUiScalePercent(Settings.uiScalePercent);
    const unwatchUiScale = Settings.watch("uiScalePercent", (value) => {
      setUiScalePercent(value);
    });

    // FPS 上限跟随设置面板实时更新（状态栏展示用）
    const unwatchMaxFps = Settings.watch("maxFps", (value) => {
      setMaxFps(value);
    });

    // 恢复窗口位置大小
    restoreStateCurrent(StateFlags.SIZE | StateFlags.POSITION | StateFlags.MAXIMIZED);

    // nx-pg：原 onResized → isMaximizedWorkaround 只为驱动已删除的 WindowButtons 高亮，删去。

    if (!telemetryEventSent) {
      setTelemetryEventSent(true);
      (async () => {
        const cpu = await cpuInfo();
        await Telemetry.event("启动应用", {
          version: await getVersion(),
          os: platform(),
          arch: arch(),
          osVersion: isLinux ? `${await invoke("get_distribution")} ${version()}` : version(),
          cpu: cpu.cpus[0].brand,
          cpuCount: cpu.cpu_count,
        });
      })();
    }

    // 加载完成了，显示窗口
    if (!window.ipc_bridge) {
      getCurrentWindow().show();
    }

    // 初始化全局快捷键管理
    globalShortcutManager.init();

    return () => {
      KeyBindsUI.uiStopListen();
      // 清理全局快捷键资源
      unwatchWindowBackgroundAlpha();
      unwatchUiScale();
      unwatchMaxFps();
      unwatchThemeMode();
      globalShortcutManager.dispose();
    };
  }, []);

  useEffect(() => {
    setIsClassroomMode(Settings.isClassroomMode);
  }, [Settings.isClassroomMode]);

  useEffect(() => {
    const updateTabRenderLoops = () => {
      if (!activeResourceTab) return;
      if (Settings.pauseRenderWhenTabUnfocused) {
        activeResourceTab.loop();
        tabs.filter((tab) => tab !== activeResourceTab).forEach((tab) => tab.pause());
      } else {
        tabs.filter((tab) => isResourceTab(tab) && !tab.closing).forEach((tab) => tab.loop());
      }
    };
    return Settings.watch("pauseRenderWhenTabUnfocused", updateTabRenderLoops);
  }, [activeResourceTab, tabs]);

  useEffect(() => {
    TabWorkspace.synchronizeGroups();
  }, [tabs]);

  // 关掉最后一个 Project 后：再创建空草稿并弹出欢迎窗（启动时无 Project 由 main 处理，这里只响应 true→false）
  const previousHadProjectRef = useRef(tabs.some((tab) => tab instanceof Project && !tab.closing));
  useEffect(() => {
    const hasOpenProject = tabs.some((tab) => tab instanceof Project && !tab.closing);
    const previousHadProject = previousHadProjectRef.current;
    previousHadProjectRef.current = hasOpenProject;
    if (previousHadProject && !hasOpenProject) {
      void (async () => {
        await onNewDraft();
        WelcomeWindow.open();
      })();
    }
  }, [tabs]);

  useEffect(() => {
    let unlisten1: () => void;
    /**
     * 关闭窗口时的事件监听
     */
    getCurrentWindow()
      .onCloseRequested(async (e) => {
        e.preventDefault();

        // 检查是否有未保存的项目
        const unsavedTabs = tabs.filter(
          (tab): tab is Project =>
            tab instanceof Project &&
            (tab.projectState === ProjectState.Unsaved || tab.projectState === ProjectState.Stashed),
        );

        if (unsavedTabs.length > 0) {
          // 弹出警告对话框
          const response = await Dialog.buttons(
            "检测到未保存文件",
            `当前有 ${unsavedTabs.length} 个未保存的文件。直接关闭可能有文件被清空的风险，建议先手动保存文件。`,
            [
              { id: "cancel", label: "取消", variant: "ghost" },
              { id: "continue", label: "继续关闭", variant: "destructive" },
            ],
          );

          if (response === "cancel") {
            // 用户选择取消关闭，返回
            return;
          }
          // 用户选择继续关闭，执行原有关闭流程
        }

        try {
          for (const tab of tabs) {
            console.log("尝试关闭", tab);
            await closeTab(tab);
          }
        } catch {
          Telemetry.event("关闭应用提示是否保存文件选择了取消");
          return;
        }
        Telemetry.event("关闭应用");
        // 保存窗口位置
        await saveWindowState(StateFlags.SIZE | StateFlags.POSITION | StateFlags.MAXIMIZED);
        await getCurrentWindow().destroy();
      })
      .then((it) => {
        unlisten1 = it;
      });

    for (const tab of tabs) {
      tab.on("state-change", () => {
        // 强制重新渲染一次
        setTabs([...tabs]);
      });
      tab.on("contextmenu", ({ x, y }) => {
        contextMenuTriggerRef.current?.dispatchEvent(
          new MouseEvent("contextmenu", {
            bubbles: true,
            clientX: x,
            clientY: y,
          }),
        );
        setTabs([...tabs]);
      });
    }

    return () => {
      unlisten1?.();
      for (const tab of tabs) {
        tab.removeAllListeners("state-change");
        tab.removeAllListeners("contextmenu");
      }
    };
  }, [tabs.length]);

  const closeTab = async (tab: Tab) => {
    if (tab instanceof Project) {
      if (tab.projectState === ProjectState.Stashed) {
        toast("文件还没有保存，但已经暂存，在“最近打开的文件”中可恢复文件");
      } else if (tab.projectState === ProjectState.Unsaved) {
        // 切换到这个文件
        setActiveTab(tab);
        const response = await Dialog.buttons("是否保存更改？", decodeURI(tab.uri.toString()), [
          { id: "cancel", label: "取消", variant: "ghost" },
          { id: "discard", label: "不保存", variant: "destructive" },
          { id: "save", label: "保存" },
        ]);
        if (response === "save") {
          await tab.save();
        } else if (response === "cancel") {
          throw new Error("取消操作");
        }
      }
    }
    await TabWorkspace.close(tab.id);
  };

  const handleTabClick = useCallback((tab: Tab) => {
    TabWorkspace.focus(tab.id);
  }, []);

  const handleTabClose = useCallback(
    async (tab: Tab) => {
      await closeTab(tab);
    },
    [closeTab],
  );

  const zoomStyle = uiScalePercent !== 100 ? ({ zoom: `${uiScalePercent / 100}` } as React.CSSProperties) : undefined;

  return (
    <>
      {/* 这是一个底层的 div，用于在拖拽改变窗口大小时填充背景，防止窗口出现透明闪烁 */}
      <div className="fixed inset-0 z-[-1] bg-(--stage-background)" style={{ opacity: windowBackgroundAlpha }} />
      <div
        className="relative flex h-full w-full flex-col overflow-clip rounded-lg sm:gap-2"
        onContextMenu={(event) => {
          if ((event.target as Element).closest('[data-slot="context-menu-trigger"]')) return;
          event.preventDefault();
        }}
      >
        {/* Canvas content - NOT zoomed */}
        <DockedArea onTabClick={handleTabClick} onTabClose={handleTabClose} isClassroomMode={isClassroomMode} />

        {/* Zoomed UI layer - 缩放所有 DOM UI 元素，不缩放 Canvas 画布 */}
        <div
          style={zoomStyle}
          className="pointer-events-none relative z-10 flex h-full w-full flex-col *:pointer-events-auto"
        >
          {/* 菜单 | 标签页 | ...窗口拖拽区... | 主题明暗开关
              nx-pg：右侧的窗口控制按钮组（钉住/最小化/最大化/关闭）已删除——
              那是 Tauri 桌面窗口能力（getCurrentWindow().minimize 等），web 化无意义，
              浏览器窗口自有系统级控制。 */}
          <div
            className={cn(
              "bg-background z-10 flex h-4 items-center border-b transition-all hover:opacity-100 sm:h-8 sm:gap-2",
              isClassroomMode && "opacity-0",
            )}
          >
            <div
              className="hover:bg-primary/25 h-full min-w-6 cursor-grab transition-colors active:cursor-grabbing sm:hidden"
              onMouseDown={handleTitleBarMouseDown}
            />
            <GlobalMenu />
            <div className="h-full flex-1 cursor-grab active:cursor-grabbing" onMouseDown={handleTitleBarMouseDown} />
            <div className="hidden sm:block">
              <ThemeModeSwitch />
            </div>
          </div>

          {/* 右键菜单 */}
          <ContextMenu>
            <ContextMenuTrigger>
              <div ref={contextMenuTriggerRef} />
            </ContextMenuTrigger>
            <MyContextMenuContent />
          </ContextMenu>

          {/* nx-pg：画布状态栏（缩放 / 实体计数 / FPS）。
              放在「已缩放 UI 层」内即可随 UI 缩放，组件自身不要再吃 zoomStyle —— 重复叠加会变成平方级缩放。 */}
          {activeResourceTab instanceof Project && <StageStatusBar project={activeResourceTab} maxFps={maxFps} />}
        </div>

        {/* NOT zoomed - 使用固定/全屏定位的组件，缩放会破坏它们的坐标计算 */}
        <FloatingTabs zoomStyle={zoomStyle} onTabClose={closeTab} />
        <PieMenu />

        {/* nx-pg：右上角关闭触发角已删（getCurrentWindow().close() 是桌面窗口能力） */}
        {activeResourceTab instanceof Project ? <DropWindowCover project={activeResourceTab} /> : null}

        <CommandPalette zoomStyle={zoomStyle} />
        <RenderOverlays />
      </div>
    </>
  );
}

/**
 * nx-pg：原版 WindowButtons（窗口右上角 钉住/最小化/最大化/关闭 四按钮）已删除。
 * 全部能力基于 getCurrentWindow()（Tauri 桌面窗口 API），web 化无意义——
 * 浏览器窗口自有系统级最小化/最大化/关闭。
 */

export function Catch() {
  return <></>;
}
