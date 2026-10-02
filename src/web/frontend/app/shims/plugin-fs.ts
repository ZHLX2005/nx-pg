// ---------- @tauri-apps/plugin-fs shim ----------
// 全部走 nx-pg server 的 /api/project/fs/*（见 src/modules/project）。
// 响应统一 { ok, data } 包裹（见 src/runtime/api.js）；base64 字段由前端解码。

export interface DirEntry {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
  isSymlink: boolean;
}

async function httpJson(path: string, init?: RequestInit): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const res = await fetch(path, init);
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok) {
    throw new Error(`[fs] ${res.status} ${body?.error ?? "(无响应)"}`);
  }
  return body;
}

function toBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function fromBytes(bytes: Uint8Array | string): string {
  if (typeof bytes === "string") return btoa(unescape(encodeURIComponent(bytes)));
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export async function readFile(path: string): Promise<Uint8Array> {
  const body = await httpJson(`/api/project/fs/read?path=${encodeURIComponent(path)}`);
  const data = body.data as { dataB64: string };
  return toBytes(data.dataB64);
}

export async function writeFile(path: string, contents: Uint8Array | string): Promise<void> {
  await httpJson("/api/project/fs/write", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path, b64: fromBytes(contents) }),
  });
}

export async function exists(path: string): Promise<boolean> {
  const body = await httpJson(`/api/project/fs/exists?path=${encodeURIComponent(path)}`);
  return !!(body.data as { exists: boolean }).exists;
}

export async function mkdir(path: string, _options?: { recursive?: boolean }): Promise<void> {
  await httpJson("/api/project/fs/mkdir", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path }),
  });
}

export async function remove(path: string, _options?: { recursive?: boolean }): Promise<void> {
  await httpJson("/api/project/fs/remove", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path }),
  });
}

export async function rename(oldPath: string, newPath: string): Promise<void> {
  await httpJson("/api/project/fs/rename", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ from: oldPath, to: newPath }),
  });
}

export async function readDir(path: string): Promise<DirEntry[]> {
  const body = await httpJson(`/api/project/fs/readdir?path=${encodeURIComponent(path)}`);
  return (body.data as { entries: DirEntry[] }).entries;
}

export async function stat(path: string): Promise<{ isDirectory: boolean; isFile: boolean; size: number }> {
  // server 没有 stat action；用 exists + readdir 推断（简化）
  const ex = await exists(path);
  if (!ex) throw new Error(`[fs:stat] ENOENT ${path}`);
  // 文件大小需要读 readFile —— 太大开销；这里给出占位
  return { isDirectory: false, isFile: true, size: 0 };
}

export async function lstat(path: string) {
  return await stat(path);
}