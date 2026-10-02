// ---------- @tauri-apps/plugin-dialog ----------
// nx-pg 架构：文件都存于 server 端 workspace（默认 ~/.nx-pg/workspace）。
// 对话框的职责 = 在 workspace 下选一个文件名。
//   save() → 直接用 suggestedName 生成 workspace 内绝对路径（避免造 UI；重名加时间戳）
//   open() → prompt() 让用户输入/确认文件名（headless 无阻塞问题由调用方控制）
// 返回的路径都是真实绝对路径，URI.file() 可正常解析，FileSystemProviderFile → server 校验通过。

interface OpenOptions {
  multiple?: boolean;
  directory?: boolean;
  filters?: { name: string; extensions: string[] }[];
  title?: string;
  defaultPath?: string;
}
interface SaveOptions {
  title?: string;
  filters?: { name: string; extensions: string[] }[];
  defaultPath?: string;
}

let workspaceCache: string | null = null;

export async function getWorkspaceDir(): Promise<string> {
  if (workspaceCache) return workspaceCache;
  try {
    const res = await fetch("/api/project/workspace");
    const body = await res.json();
    workspaceCache = body?.data?.path ?? "";
  } catch {
    workspaceCache = "";
  }
  return workspaceCache;
}

function joinWs(ws: string, name: string): string {
  const sep = ws.includes("\\") ? "\\" : "/";
  return ws.endsWith(sep) ? ws + name : ws + sep + name;
}

function defaultName(filters?: { extensions: string[] }[]): string {
  const ext = filters?.[0]?.extensions?.[0] ?? "prg";
  const base = ext === "prg" ? "untitled" : "file";
  return `${base}.${ext}`;
}

export async function save(options: SaveOptions = {}): Promise<string | null> {
  const ws = await getWorkspaceDir();
  if (!ws) return null;
  const raw = options.defaultPath?.split(/[\\/]/).pop() || defaultName(options.filters);
  // 重名自动加时间戳（无对话框 UI 的代价；个人使用可接受）
  let name = raw;
  try {
    const check = await fetch(`/api/project/fs/exists?path=${encodeURIComponent(joinWs(ws, name))}`);
    const body = await check.json();
    if (body?.data?.exists) {
      const dot = raw.lastIndexOf(".");
      const stem = dot > 0 ? raw.slice(0, dot) : raw;
      const ext = dot > 0 ? raw.slice(dot) : "";
      name = `${stem}-${Date.now()}${ext}`;
    }
  } catch {
    /* server 不可达时保持原名，让 write 报错 */
  }
  return joinWs(ws, name);
}

export async function open(options: OpenOptions = {}): Promise<string | string[] | null> {
  if (options.directory) return null; // 目录选择不支持（个人使用未用到）
  const ws = await getWorkspaceDir();
  if (!ws) return null;
  // 列出 workspace 下的候选文件，prompt 让用户确认
  let candidate = options.defaultPath?.split(/[\\/]/).pop() ?? "";
  try {
    const res = await fetch(`/api/project/fs/readdir`);
    const body = await res.json();
    const exts = options.filters?.[0]?.extensions;
    const files: string[] = (body?.data?.entries ?? [])
      .filter((e: { isFile: boolean }) => e.isFile)
      .map((e: { name: string }) => e.name)
      .filter((n: string) => !exts || exts.includes("*") || exts.some((x) => n.toLowerCase().endsWith("." + x.toLowerCase())));
    if (files.length > 0 && !candidate) candidate = files[0];
    const input = window.prompt(
      files.length > 0
        ? `输入要打开的文件名（workspace 现有：${files.slice(0, 8).join("、")}${files.length > 8 ? " …" : ""}）`
        : "输入要打开的文件名（workspace 为空）",
      candidate,
    );
    if (!input) return null;
    return joinWs(ws, input.trim());
  } catch {
    return null;
  }
}

export async function message(_title: string, _messageText?: string, _kind?: string): Promise<void> {}
export async function ask(_title: string, _messageText?: string): Promise<boolean> {
  return window.confirm(_messageText ?? _title);
}
export async function confirm(_title: string, _messageText?: string): Promise<boolean> {
  return window.confirm(_messageText ?? _title);
}
