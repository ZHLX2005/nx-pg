// 主面板激活文件上报 —— CLI 侧 `canvas active` 的数据源。
//
// activeTabAtom 变化时 fire-and-forget POST /api/canvas/active（150ms debounce，
// 拖拽切 tab 时不打爆请求）。失败静默：上报是尽力而为，断网/ server 未起不影响画布。
import { store, activeTabAtom } from "@/state";
import { Project } from "@/core/Project";

export namespace CanvasActiveReporter {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastPath = "";
  let subscribed = false;

  export function start(): void {
    if (subscribed) return;
    subscribed = true;
    store.sub(activeTabAtom, () => schedule());
    // 页面隐藏/关闭时跳过 debounce 立即上报（headless 自动化常秒开秒关）
    window.addEventListener("pagehide", () => {
      if (timer) clearTimeout(timer);
      report();
    });
    schedule(); // 首帧也报一次（草稿/恢复的文件）
  }

  function schedule(): void {
    if (timer) clearTimeout(timer);
    timer = setTimeout(report, 150);
  }

  function report(): void {
    const tab = store.get(activeTabAtom);
    const path = tab instanceof Project ? decodeURIComponent(tab.uri.fsPath) : "";
    if (!path || path === lastPath) return;
    lastPath = path;
    void fetch("/api/canvas/active", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path, name: tab.title }),
    }).catch(() => {});
  }
}
