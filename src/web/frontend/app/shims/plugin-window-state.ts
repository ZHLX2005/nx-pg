// ---------- @tauri-apps/plugin-window-state ----------
export const StateFlags = {
  DECORATIONS: 1,
  POSITION: 2,
  SIZE: 4,
  MAXIMIZED: 8,
  FULLSCREEN: 16,
  VISIBLE: 32,
  ALL: 63,
} as const;

export async function saveWindowState(_flags?: number): Promise<void> {}
export async function restoreStateCurrent(_flags?: number): Promise<void> {}
