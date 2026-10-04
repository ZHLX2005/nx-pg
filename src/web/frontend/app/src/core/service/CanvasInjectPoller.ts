// canvas 注入轮询器 —— CLI `canvas inject` 的前端消费端。
//
// 链路：CLI POST /api/canvas/inject（入队 inject-queue.json）
//       → 本轮询器每 2s GET /api/canvas/inject（take-all，取走即清空）
//       → generateNodeByMarkdown 注入当前激活画布（视野右侧追加，不覆盖已有内容）
//       → 不自动保存：注入只改内存态，用户 Ctrl+S 决定是否留存。
//
// 页面隐藏时暂停轮询（document.visibilitychange），回到前台立即拉一次。
// 所有失败静默：注入是尽力而为，server 未起/网络错误不影响画布。
import { store, activeResourceTabAtom, activeTabAtom } from "@/state";
import { Project } from "@/core/Project";
import { Vector } from "@graphif/data-structures";
import { toast } from "sonner";

export namespace CanvasInjectPoller {
  const INTERVAL_MS = 2000;
  let timer: ReturnType<typeof setInterval> | null = null;
  let started = false;

  export function start(): void {
    if (started) return;
    started = true;
    timer = setInterval(() => {
      if (document.visibilityState === "visible") void poll();
    }, INTERVAL_MS);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void poll();
    });
  }

  export function stop(): void {
    if (timer) clearInterval(timer);
    timer = null;
    started = false;
  }

  async function poll(): Promise<void> {
    let items: Array<{ id: string; md: string; nodes: number }> = [];
    try {
      const res = await fetch("/api/canvas/inject");
      const body = (await res.json().catch(() => null)) as { ok?: boolean; data?: { items?: typeof items } } | null;
      if (!body?.ok) return;
      items = body.data?.items ?? [];
    } catch {
      return; // server 未起 / 网络错误：静默
    }
    if (!items.length) return;

    const project = resolveProject();
    if (!project) {
      toast.error(`CLI 注入丢弃（${items.length} 条）：没有打开的画布`);
      return;
    }

    let injected = 0;
    for (const item of items) {
      try {
        project.stageManager.generateNodeByMarkdown(item.md, injectLocation(project), true);
        injected++;
      } catch (e) {
        console.error("[nx-pg] canvas inject 解析失败", e);
      }
    }
    if (injected > 0) {
      const total = items.reduce((sum, it) => sum + (it.nodes || 0), 0);
      toast.success(`已注入 ${injected} 棵树（约 ${total} 节点，来自 CLI）——Ctrl+S 留存`);
    }
  }

  function resolveProject(): Project | undefined {
    const candidates = [store.get(activeResourceTabAtom), store.get(activeTabAtom)];
    for (const tab of candidates) {
      if (tab instanceof Project && !tab.closing) return tab;
    }
    return undefined;
  }

  /** 注入位置：当前视野右缘外侧（不与可见内容重叠） */
  function injectLocation(project: Project): Vector {
    try {
      const cover = project.renderer.getCoverWorldRectangle();
      return new Vector(cover.location.x + cover.size.x + 100, project.camera.location.y);
    } catch {
      return project.camera.location;
    }
  }
}
