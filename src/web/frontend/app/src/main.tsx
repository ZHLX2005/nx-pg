// nx-pg web 版入口：从 project-graph main.tsx 精简而来。
// 砍掉：CLI 模式、桌面验收、auth、deep-link、vconsole、Tauri 窗口显示、启动文件恢复（改 server 最近文件）。
// 保留：i18n、各 Manager init、App 渲染。

// 最早阶段：屏蔽浏览器前进/后退/右键手势（必须在 App.tsx 之前装上，
// 否则 App 内的事件监听虽捕获但浏览器已先完成默认行为——例如右键菜单无法 preventDefault）
import "@/core/environment/browserGestureGuard";

import { Toaster } from "@/components/ui/sonner";
import { MouseLocation } from "@/core/service/controlService/MouseLocation";
import { RecentFileManager } from "@/core/service/dataFileService/RecentFileManager";
import { ColorManager } from "@/core/service/feedbackService/ColorManager";
import { QuickSettingsManager } from "@/core/service/QuickSettingsManager";
import { Settings } from "@/core/service/Settings";
import { EdgeCollisionBoxGetter } from "@/core/stage/stageObject/association/EdgeCollisionBoxGetter";
import { store, tabsAtom } from "@/state";
import i18next from "i18next";
import { Provider } from "jotai";
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "react-error-boundary";
import { initReactI18next } from "react-i18next";
import type { ReactNode } from "react";
import App from "./App";
import "./css/index.css";
import Fallback from "./Fallback";

const el = document.getElementById("root")!;

/** 分阶段心跳：headless 下若某阶段卡住，server 日志里能看到停在哪儿 */
function beat(stage: string, extra: Record<string, string> = {}) {
  const q = new URLSearchParams({ stage, ...extra });
  fetch(`/api/health?${q}`).catch(() => {});
}

// 未捕获异常 / Promise 拒绝也上报 —— 否则 headless 里页面白屏时无从定位
window.addEventListener("error", (e) => {
  beat("window-error", { msg: String(e.message).slice(0, 150) });
});
window.addEventListener("unhandledrejection", (e) => {
  beat("unhandled", { msg: String((e.reason as Error)?.message ?? e.reason).slice(0, 150) });
});

(async () => {
  try {
    beat("boot");
    await Promise.all([RecentFileManager.init(), ColorManager.init(), QuickSettingsManager.init()]);
    beat("managers");
    await Promise.all([loadLanguageFiles(), loadSyncModules()]);
    beat("i18n");

    // 渲染应用（flushSync 强制同步提交，保证后续 DOM 检查有效）
    const root = createRoot(el);
    // ?minimal=1：二分定位渲染死循环 —— 只渲染最小树
    // ?app=<sub>：渲染 App 的单个子树（GlobalMenu / DockedArea / CommandPalette / overlays）
    const params = new URLSearchParams(location.search);
    const minimal = params.has("minimal");
    const appSub = params.get("app");
    let tree: ReactNode;
    if (minimal) {
      tree = <div id="minimal-ok">minimal-ok</div>;
    } else if (appSub === "GlobalMenu") {
      const { GlobalMenu } = await import("@/core/service/GlobalMenu");
      tree = <GlobalMenu />;
    } else if (appSub === "DockedArea") {
      const { default: DockedArea } = await import("./components/docked-area");
      tree = <DockedArea onTabClick={() => {}} onTabClose={() => {}} isClassroomMode={false} />;
    } else if (appSub === "CommandPalette") {
      const { default: CommandPalette } = await import("./CommandPalette");
      tree = <CommandPalette zoomStyle={undefined} />;
    } else if (appSub === "Overlays") {
      const { default: RenderOverlays } = await import("./components/overlay-host");
      tree = <RenderOverlays />;
    } else {
      tree = <App />;
    }
    root.render(
      <Provider store={store}>
        <Toaster richColors visibleToasts={5} expand />
        <ErrorBoundary FallbackComponent={Fallback}>{tree}</ErrorBoundary>
      </Provider>,
    );
    beat("render-start", { minimal: String(minimal), app: appSub ?? "full" });
    await new Promise<void>((r) => setTimeout(r, 300));
    beat("rendered", { html: String(el.innerHTML.length) });

    // 启动草稿（内联版：每步心跳）
    if (store.get(tabsAtom).length === 0) {
      beat("draft-1");
      const { Project } = await import("@/core/Project");
      const project = Project.newDraft();
      beat("draft-2", { stage: project.uri.scheme });
      const { loadAllServicesBeforeInit } = await import("@/core/loadAllServices");
      loadAllServicesBeforeInit(project);
      beat("draft-3");
      await project.init();
      beat("draft-4");
      const { loadAllServicesAfterInit } = await import("@/core/loadAllServices");
      loadAllServicesAfterInit(project);
      beat("draft-5");
      store.set(tabsAtom, [...store.get(tabsAtom), project]);
      const { activeTabAtom, activeResourceTabAtom } = await import("@/state");
      store.set(activeTabAtom, project);
      store.set(activeResourceTabAtom, project);
      beat("draft-6");
    }

    await new Promise<void>((r) => setTimeout(r, 600));
    beat("settled", {
      canvas: String(document.querySelectorAll("canvas").length),
      html: String(el.innerHTML.length),
      body: String(document.body.innerHTML.length),
    });

    // 手柄支持（nx-pg 新开发：原项目只有设置残骸）——rAF 轮询，无手柄时零成本
    const { GamepadService } = await import("@/core/service/controlService/GamepadService");
    GamepadService.start();

    // ?selftest=1：交互管线自测（合成 pointer/wheel/keyboard 事件驱动 Controller 全链路）
    if (new URLSearchParams(location.search).has("selftest")) {
      const { runSelfTest } = await import("./selftest");
      await runSelfTest();
    }
  } catch (error) {
    beat("failed", { err: String((error as Error)?.message ?? error).slice(0, 120) });
    console.error("[nx-pg] 启动失败", error);
    throw error;
  }
})();

/** 加载同步初始化的模块 */
async function loadSyncModules() {
  EdgeCollisionBoxGetter.init();
  MouseLocation.init();
}

/** 加载语言文件 */
async function loadLanguageFiles() {
  i18next.use(initReactI18next).init({
    lng: Settings.language,
    debug: false,
    defaultNS: "",
    fallbackLng: false,
    saveMissing: false,
    resources: {
      en: await import("./locales/en.yml").then((m) => m.default),
      zh_CN: await import("./locales/zh_CN.yml").then((m) => m.default),
    },
  });
}
