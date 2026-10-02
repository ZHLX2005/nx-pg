// Tauri shim：把 @tauri-apps/* 的 API 映射到浏览器/ nx-pg server 等价物。
// 目标：迁移过来的 project-graph 源码 import 路径零改动（vite alias 指到这里）。
// 每个 shim 的语义尽量对齐原 API；桌面独有能力（多窗口、deep-link、updater…）降级为 no-op。

// ---------- @tauri-apps/api/core ----------
export const isTauri = false;
export async function invoke(_cmd, _args) {
  // OCR 等 Rust 命令一律不可用（需求明确砍掉）
  throw new Error(`[nx-pg] Tauri invoke("${_cmd}") 在 Web 版不可用`);
}

// ---------- @tauri-apps/api/path ----------
// 路径工具：Windows 上用反斜杠语义由 server 决定；前端仅做字符串拼接。
export function join(...parts: string[]): string {
  const joined = parts
    .filter((p) => typeof p === "string" && p.length > 0)
    .join("/")
    .replace(/\/+/g, "/");
  return joined;
}
export function dirname(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i === -1 ? p : p.slice(0, i);
}
// 同步字符串 —— utils/path.tsx 等直接 import { sep } 后使用
export const sep: string = "/";
export const appCacheDir = async () => "";
export const appDataDir = async () => "";
export const appLocalDataDir = async () => "";
export const dataDir = async () => "";
export const homeDir = async () => "";
export const tempDir = async () => "";

// ---------- @tauri-apps/api/window ----------
// 浏览器没有窗口管理；提供安全的 no-op 对象。
export function getCurrentWindow() {
  // 通用事件订阅 no-op：返回 Promise<unlisten>。onDragDropEvent 等桌面独有事件一律不触发。
  const unlisten = async () => {};
  return {
    async show() {},
    async hide() {},
    async close() {
      window.close();
    },
    async minimize() {},
    async toggleMaximize() {},
    async isMaximized() {
      return window.outerWidth >= screen.availWidth && window.outerHeight >= screen.availHeight;
    },
    async isFullscreen() {
      return !!document.fullscreenElement;
    },
    async setFullscreen(on) {
      if (on) await document.documentElement.requestFullscreen?.().catch(() => {});
      else if (document.fullscreenElement) await document.exitFullscreen?.().catch(() => {});
    },
    async setAlwaysOnTop() {},
    async setSkipTaskbar() {},
    async startDragging() {},
    async setTitle(t) {
      document.title = t;
    },
    async setResizable() {},
    async setPosition() {},
    async setSize(size) {
      // LogicalSize { width, height } → 浏览器窗口缩放（尽力而为）
      const w = (size as { width?: number })?.width;
      const h = (size as { height?: number })?.height;
      if (w && h) window.resizeTo(w, h);
    },
    async setFocus() {
      window.focus();
    },
    async innerScale() {
      return 1;
    },
    async scaleFactor() {
      return window.devicePixelRatio;
    },
    async innerPosition() {
      return { x: window.screenX, y: window.screenY };
    },
    async outerPosition() {
      return { x: window.screenX, y: window.screenY };
    },
    async innerSize() {
      return { width: window.innerWidth, height: window.innerHeight };
    },
    async outerSize() {
      return { width: window.outerWidth, height: window.outerHeight };
    },
    async isVisible() {
      return document.visibilityState === "visible";
    },
    // 事件订阅（桌面独有能力：web 下降级为永不触发）
    onResized: () => unlisten(),
    onMoved: () => unlisten(),
    onCloseRequested: () => unlisten(),
    onFocusChanged: () => unlisten(),
    onDragDropEvent: () => unlisten(),
    onFileDropEvent: () => unlisten(),
    onThemeChanged: () => unlisten(),
    onScaleChanged: () => unlisten(),
    onMenuClicked: () => unlisten(),
    label: "main",
  };
}

// ---------- @tauri-apps/api/app ----------
export const getVersion = async () => "__APP_VERSION__";

// ---------- @tauri-apps/api/event ----------
// 应用内事件总线（原来是 tauri 全局事件，web 版仅同窗口广播可用）
const eventListeners = new Map();
export async function listen(event, handler) {
  if (!eventListeners.has(event)) eventListeners.set(event, new Set());
  eventListeners.get(event).add(handler);
  return () => eventListeners.get(event)?.delete(handler);
}
export function emitEvent(event, payload) {
  for (const h of eventListeners.get(event) ?? []) h({ payload });
}

// ---------- @tauri-apps/api/image ----------
export class Image {
  constructor(_data) {}
  static async fromBytes(b) {
    return new Image(b);
  }
  static async fromPngBytes(b) {
    return new Image(b);
  }
  static async fromRgbaPixels(p, w, h) {
    return new Image({ p, w, h });
  }
  async toPngBytes() {
    return new Uint8Array();
  }
  async toRawPixels() {
    return new Uint8Array();
  }
  get width() {
    return 0;
  }
  get height() {
    return 0;
  }
  async rgba() {
    return new Uint8Array();
  }
}

// ---------- @tauri-apps/api/dpi ----------
export class LogicalSize {
  constructor(public width, public height) {}
  toJSON() {
    return { Logical: { width: this.width, height: this.height } };
  }
}
export class PhysicalSize {
  constructor(public width, public height) {}
}
export type Logical = { Logical: { width: number; height: number } };
