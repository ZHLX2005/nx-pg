// ---------- @tauri-apps/plugin-clipboard-manager ----------
// 浏览器 Clipboard API 能力映射（写图能力 Safari 支持、Chromium 正在支持；不行就降级为 png blob 下载提示）。

export async function writeText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

export async function readText(): Promise<string> {
  return await navigator.clipboard.readText();
}

export async function writeImage(imageLike: unknown): Promise<void> {
  // 原项目传 Tauri Image（rgba）。我们拿到什么就尽力写什么。
  try {
    const anyImg = imageLike as { toPngBytes?: () => Promise<Uint8Array> };
    let bytes: Uint8Array | undefined;
    if (anyImg?.toPngBytes) bytes = await anyImg.toPngBytes();
    if (bytes) {
      const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: "image/png" });
      const item = new ClipboardItem({ "image/png": blob });
      await navigator.clipboard.write([item]);
      return;
    }
  } catch {
    // 剪贴板写图失败不致命
  }
  throw new Error("[nx-pg] 当前浏览器不支持写入图片到剪贴板");
}

export async function readImage(): Promise<unknown> {
  throw new Error("[nx-pg] 当前浏览器不支持从剪贴板读取图片对象");
}

export async function read(): Promise<{ types: string[] }> {
  // 简化实现：探测文本/图片可用性
  const types: string[] = [];
  try {
    const items = await navigator.clipboard.read();
    for (const i of items) for (const t of i.types) types.push(t);
  } catch {
    /* 权限不足时静默 */
  }
  return { types };
}
