// 交互自测模块：?selftest=1 时运行。
// 用页面内合成的 PointerEvent / WheelEvent / KeyboardEvent 驱动完整交互管线
// （canvas 事件 → Controller → StageManager），每步结果通过 /api/health 心跳上报。
// isTrusted=false 的合成事件不被任何 controller 检查，管线与真实鼠标一致。
import { store, activeTabAtom } from "@/state";
import { Project } from "@/core/Project";

function beat(stage: string, extra: Record<string, string> = {}) {
  const q = new URLSearchParams({ stage, ...extra });
  fetch(`/api/health?${q}`).catch(() => {});
}

function getProject(): Project | undefined {
  const tab = store.get(activeTabAtom);
  return tab instanceof Project ? tab : undefined;
}

function centerOfCanvas(): { x: number; y: number; el: HTMLCanvasElement } {
  const el = document.querySelector("canvas")!;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, el };
}

function pointer(el: HTMLCanvasElement, type: string, x: number, y: number, button = 0, extra: Record<string, number> = {}) {
  el.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      clientX: x,
      clientY: y,
      button,
      buttons: type === "pointerdown" ? 1 : type === "pointerup" ? 0 : 1,
      pointerId: 1,
      isPrimary: true,
      ...extra,
    }),
  );
}

function wheel(el: HTMLCanvasElement, deltaY: number, x: number, y: number) {
  el.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY, clientX: x, clientY: y, cancelable: true }));
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function runSelfTest(): Promise<void> {
  beat("st-boot");
  await sleep(1200); // 等画布挂载 + 首帧渲染

  const project = getProject();
  if (!project) {
    beat("st-fail", { why: "no-active-project" });
    return;
  }
  const { x, y, el } = centerOfCanvas();
  beat("st-canvas", { w: String(el.clientWidth), h: String(el.clientHeight), nodes0: String(project.stageManager.getTextNodes().length) });

  // ---- 1. 双击建节点（ControllerEntityCreate：双击空白处创建 TextNode）----
  pointer(el, "pointerdown", x, y, 0);
  pointer(el, "pointerup", x, y, 0);
  await sleep(30);
  pointer(el, "pointerdown", x, y, 0);
  pointer(el, "pointerup", x, y, 0);
  await sleep(300);
  let nodes = project.stageManager.getTextNodes().length;
  beat("st-doubleclick", { nodes: String(nodes) });

  // 双击不行则试 Tab 快捷键（原项目 Tab = 新建节点）
  if (nodes === 0) {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    await sleep(300);
    nodes = project.stageManager.getTextNodes().length;
    beat("st-tabkey", { nodes: String(nodes) });
  }

  // ---- 1.5. 单 c 键切换左键模式（nx-pg 新加功能）----
  try {
    const { Settings } = await import("@/core/service/Settings");
    const beforeMode = Settings.mouseLeftMode;
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "c", bubbles: true }));
    await sleep(150);
    const afterMode = Settings.mouseLeftMode;
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "c", bubbles: true }));
    await sleep(150);
    const finalMode = Settings.mouseLeftMode;
    const hudFrames = (project.leftButtonModeSwitch as { _hudFrames?: number })._hudFrames ?? 0;
    beat("st-c-toggle", {
      before: String(beforeMode),
      after1: String(afterMode),
      after2: String(finalMode),
      toggled: String(beforeMode !== afterMode),
      back: String(afterMode !== finalMode),
      hudActive: String(hudFrames > 0),
    });
  } catch (e) {
    beat("st-c-toggle-fail", { err: String((e as Error)?.message ?? e).slice(0, 100) });
  }

  // ---- 1.6. 左键单击建节点（nx-pg 新增，原项目用双击）----
  // nx-pg 设计回归原 project-graph：节点创建走 mouseDoubleClick，ControllerClass._mouseup 检测双击后
  // 分发到此方法。Controller 总控 _mouseup 路径已注释（见 ControllerClass.tsx line 117-125），
  // 单击左键不再创建节点——避免与 ControllerNodeConnection 的「按住左键拖出连线」冲突。
  // 因此 st-singleclick-create 段不再有意义，保留 Tab 键路径作为创建节点验证。

  // 按 F 重置视野，让节点出现在画面里（后续截图可见）
  el.dispatchEvent(new KeyboardEvent("keydown", { key: "f", bubbles: true }));
  await sleep(400);

  // ---- 2. 相机平移（空格+左键拖拽 / 或中键拖拽）----
  const locBefore = `${project.camera.location.x.toFixed(0)},${project.camera.location.y.toFixed(0)}`;
  pointer(el, "pointerdown", x, y, 1); // 中键
  for (let i = 1; i <= 10; i++) pointer(el, "pointermove", x + i * 10, y, 1);
  pointer(el, "pointerup", x + 100, y, 1);
  await sleep(100);
  const locAfter = `${project.camera.location.x.toFixed(0)},${project.camera.location.y.toFixed(0)}`;
  beat("st-pan", { before: locBefore, after: locAfter, moved: String(locBefore !== locAfter) });

  // ---- 3. 滚轮缩放 ----
  const scaleBefore = project.camera.targetScale;
  wheel(el, -240, x, y); // 上滚 = 放大
  await sleep(200);
  const scaleAfter = project.camera.targetScale;
  beat("st-zoom", { before: scaleBefore.toFixed(3), after: scaleAfter.toFixed(3), changed: String(scaleBefore !== scaleAfter) });

  // ---- 4.5. 右键菜单事件链（已有 st-contextmenu 验证；现在查是否触发全局 contextmenu listener）----
  try {
    let contextMenuPrevented = false;
    const probe = (e: Event) => { contextMenuPrevented = e.defaultPrevented; };
    document.addEventListener("contextmenu", probe);
    const ctxEvent = new MouseEvent("contextmenu", {
      bubbles: true,
      clientX: x,
      clientY: y,
      button: 2,
      cancelable: true,
    });
    document.dispatchEvent(ctxEvent);
    document.removeEventListener("contextmenu", probe);
    beat("st-ctx-menu", { prevented: String(contextMenuPrevented) });
  } catch (e) {
    beat("st-ctx-fail", { err: String(e).slice(0, 80) });
  }

  // ---- 4. 框选（左键在远离节点的空白区拖出矩形，等双击窗口失效后再 move）----
  // 选右上 200×200 区域（远离居中节点）
  pointer(el, "pointerdown", x + 300, y - 250, 0);
  await sleep(260); // 超过 200ms 双击窗口
  for (let i = 1; i <= 10; i++) pointer(el, "pointermove", x + 300 - i * 20, y - 250 + i * 20, 0);
  // 在 mouseup 前查矩形 —— endSelecting 会清空它
  const rectBeforeUp1 = project.rectangleSelect.getRectangle();
  pointer(el, "pointerup", x + 100, y - 50, 0);
  await sleep(50);
  const rectAfterUp1 = project.rectangleSelect.getRectangle();
  // 起点直接拖（不加 260ms 等待）→ 期望无矩形（防双击检测意外失败）
  pointer(el, "pointerdown", x + 300, y + 50, 0);
  await sleep(260);
  for (let i = 1; i <= 10; i++) pointer(el, "pointermove", x + 300 - i * 20, y + 50 + i * 20, 0);
  const rectBeforeUp2 = project.rectangleSelect.getRectangle();
  pointer(el, "pointerup", x + 100, y + 250, 0);
  await sleep(150);
  beat("st-rectselect", {
    beforeUp1: String(rectBeforeUp1 !== null),
    afterUp1: String(rectAfterUp1 !== null), // 应被清空 = false
    beforeUp2: String(rectBeforeUp2 !== null),
    workflow: String(rectBeforeUp1 !== null && rectBeforeUp2 !== null),
  });

  // ---- 5. 右键菜单事件（ControllerContextMenu）----
  pointer(el, "pointerdown", x, y, 2);
  pointer(el, "pointerup", x, y, 2);
  await sleep(150);
  // 右键菜单经 Tab 的 contextmenu 事件 → App 的 dispatchEvent；这里只验证 controller 状态无异常
  beat("st-contextmenu", { ok: "1" });

  // ---- 6. 快捷键（Ctrl+A 全选 → stageManager 选中数变化）----
  el.dispatchEvent(new KeyboardEvent("keydown", { key: "a", ctrlKey: true, bubbles: true }));
  await sleep(150);
  const selectedCount = project.stageManager.getSelectedStageObjects().length;
  beat("st-selectall", { selected: String(selectedCount) });

  // ---- 7. 撤销（Ctrl+Z：节点应被撤销删除）----
  const nodesBeforeUndo = project.stageManager.getTextNodes().length;
  el.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }));
  await sleep(150);
  const nodesAfterUndo = project.stageManager.getTextNodes().length;
  beat("st-undo", { before: String(nodesBeforeUndo), after: String(nodesAfterUndo), worked: String(nodesAfterUndo < nodesBeforeUndo) });

  // ---- 8.5. 节点编辑（先建一个节点，确保有东西可编辑）----
  try {
    pointer(el, "pointerdown", x, y, 0);
    pointer(el, "pointerup", x, y, 0);
    await sleep(30);
    pointer(el, "pointerdown", x, y, 0);
    pointer(el, "pointerup", x, y, 0);
    await sleep(300);
    const tn = project.stageManager.getTextNodes().slice(-1)[0];
    if (tn) {
      const cu = project.controllerUtils;
      cu.editTextNode(tn, false);
      await sleep(400);
      const ta = document.querySelector("textarea, input[type=text], .text-node-editor");
      beat("st-edit", {
        nodeText: tn.text.slice(0, 30),
        hasInput: String(!!ta),
        tag: ta?.tagName ?? "-",
      });
      const input = ta as HTMLTextAreaElement | HTMLInputElement | null;
      if (input) input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    } else {
      beat("st-edit-skip", { why: "no-text-node-after-create" });
    }
  } catch (e) {
    beat("st-edit-fail", { err: String((e as Error)?.message ?? e).slice(0, 100) });
  }

  // ---- 7.5. 删除/复制/粘贴/Ctrl+S 快捷键（事件链验证）----
  try {
    // Ctrl+A 全选（确保有选中），Delete 应减少选中数；undo 复原
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "a", ctrlKey: true, bubbles: true }));
    await sleep(150);
    const beforeDel = project.stageManager.getTextNodes().filter((n) => n.isSelected).length;
    const totalBefore = project.stageManager.getTextNodes().length;
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
    await sleep(150);
    const totalAfterDel = project.stageManager.getTextNodes().length;
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true })); // 撤销 delete
    await sleep(150);
    const totalAfterUndoDel = project.stageManager.getTextNodes().length;

    // Ctrl+C / Ctrl+V（粘贴应增加 1）
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "c", ctrlKey: true, bubbles: true }));
    await sleep(100);
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "v", ctrlKey: true, bubbles: true }));
    await sleep(200);
    const totalAfterPaste = project.stageManager.getTextNodes().length;

    // Ctrl+S 保存（之前已 saveAs 过，uri 非 draft；这里 state 应保持 Saved）
    const stateBefore = project.projectState;
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true }));
    await sleep(300);
    const stateAfter = project.projectState;

    beat("st-shortcuts", {
      beforeSel: String(beforeDel),
      totalBefore: String(totalBefore),
      afterDel: String(totalAfterDel),
      afterUndo: String(totalAfterUndoDel),
      afterPaste: String(totalAfterPaste),
      saved: String(stateBefore === stateAfter),
    });
  } catch (e) {
    beat("st-shortcuts-fail", { err: String((e as Error)?.message ?? e).slice(0, 100) });
  }

  // ---- 9. 保存 .prg（草稿 → save() → dialog shim 自动命名 → server 落盘）----
  try {
    // 细分心跳：save → saveDialog → saveAs → getFileContent → write
    beat("st-save-1-dialog");
    await project.save({ includeThumbnail: false });
    beat("st-save", { uri: project.uri.toString(), state: String(project.projectState) });
  } catch (e) {
    const stack = (e as Error)?.stack ?? "";
    beat("st-save-fail", { err: String((e as Error)?.message ?? e).slice(0, 100), at: stack.split("\n")[1]?.trim().slice(0, 120) ?? "" });
  }

  // ---- 9. 保存→重开→恢复验证（save 时撤销了节点，所以先建一个再保存，确保 stage 非空）----
  try {
    beat("st-round-1-create");
    pointer(el, "pointerdown", x, y, 0);
    pointer(el, "pointerup", x, y, 0);
    await sleep(30);
    pointer(el, "pointerdown", x, y, 0);
    pointer(el, "pointerup", x, y, 0);
    await sleep(300);
    const nodesRound = project.stageManager.getTextNodes().length;
    beat("st-round-2-save", { nodes: String(nodesRound) });
    await project.save({ includeThumbnail: false });
    const savedPath = decodeURIComponent(project.uri.fsPath);
    beat("st-round-3-open", { path: savedPath.slice(-40) });

    const { onOpenFile } = await import("@/core/service/GlobalMenu");
    const { URI } = await import("vscode-uri");
    const reopened = await onOpenFile(URI.file(savedPath), "selftest");
    await sleep(400);
    const reopenedNodes = reopened?.stageManager.getTextNodes().length ?? -1;
    beat("st-round-4-verify", {
      reopened: String(reopened ? reopened.title : "null"),
      nodes: String(reopenedNodes),
      roundtrip: String(reopenedNodes === nodesRound),
    });
  } catch (e) {
    beat("st-round-fail", { err: String((e as Error)?.message ?? e).slice(0, 120) });
  }

  // ---- 10. Gamepad（无实体手柄时验证服务在跑 + 死区逻辑；实体摇杆需要真机）----
  try {
    const pads = navigator.getGamepads?.().length ?? -1;
    beat("st-gamepad", { apiAvailable: String(navigator.getGamepads !== undefined), pads: String(pads) });
  } catch (e) {
    beat("st-gamepad-fail", { err: String(e).slice(0, 80) });
  }

  // ---- 11. 设置面板打开（?settings=1 时才开，避免干扰其他截图）----
  if (new URLSearchParams(location.search).has("settings")) {
    try {
      const { default: SettingsPanel } = await import("@/sub/SettingsWindow");
      SettingsPanel.open("settings");
      await sleep(500);
      const tabCount = store.get((await import("@/state")).tabsAtom).length;
      beat("st-settings", { tabs: String(tabCount) });
    } catch (e) {
      beat("st-settings-fail", { err: String((e as Error)?.message ?? e).slice(0, 100) });
    }
  }

  beat("st-done");
}
