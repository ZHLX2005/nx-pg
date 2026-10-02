// ---------- @tauri-apps/plugin-http ----------
// 原项目用它绕 CORS。web 版：直接用浏览器 fetch（CORS 限制由目标站决定；AI 功能已砍，主要用途是 http 图片加载）。
export async function fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return await window.fetch(input, init);
}
