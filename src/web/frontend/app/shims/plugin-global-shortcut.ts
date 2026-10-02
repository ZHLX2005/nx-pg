// ---------- @tauri-apps/plugin-global-shortcut ----------
// 系统级全局快捷键：需求明确不做。全部 no-op。
export async function register(_shortcut: string | string[], _handler?: (e: unknown) => void): Promise<void> {}
export async function unregister(_shortcut: string): Promise<void> {}
export async function unregisterAll(): Promise<void> {}
export async function isRegistered(_shortcut: string): Promise<boolean> {
  return false;
}
