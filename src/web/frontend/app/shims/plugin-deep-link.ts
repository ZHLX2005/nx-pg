// ---------- @tauri-apps/plugin-deep-link ----------
export async function getCurrent(): Promise<string[]> {
  return [];
}
export async function onOpenUrl(_handler: (urls: string[]) => void): Promise<() => void> {
  return () => {};
}
