// ---------- @tauri-apps/plugin-shell ----------
// 外链打开 → window.open（浏览器由用户决定是否允许）。
export async function open(url: string, openWith?: string): Promise<void> {
  if (/^https?:\/\//i.test(url)) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  // file:// 等：web 版无能为力，给出提示
  console.warn(`[nx-pg] 无法在浏览器中打开非 http 链接: ${url}`, openWith);
}

export function Command(command: string) {
  return {
    async execute() {
      throw new Error(`[nx-pg] 无法在浏览器中执行命令: ${command}`);
    },
    async output() {
      throw new Error(`[nx-pg] 无法在浏览器中执行命令: ${command}`);
    },
  };
}
