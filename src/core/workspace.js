// 工作目录（workspace）与路径白名单 —— 从 project 模块下沉的共享基础设施。
//
// 用户/agent 的一切落盘路径都必须落在 workspace 内（默认 ~/.nx-pg/workspace，
// NX_PG_WORKSPACE 可覆盖）。canvas 等新模块复用同一守卫，避免每个模块各写一份。
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, isAbsolute, sep, normalize } from 'node:path';
import { homedir } from 'node:os';
import { badInput } from './errors/index.js';
import { createStore } from './store.js';

const DEFAULT_WORKSPACE = resolve(homedir(), '.nx-pg', 'workspace');

// 工作目录：env > 持久化 > 默认 ~/.nx-pg/workspace
// 持久化选项让用户首次启动后能通过 cli 修改（如 `nx-pg project workspace`）
let cachedWorkspace = null;
export async function getWorkspace() {
  if (cachedWorkspace) return cachedWorkspace;
  const env = process.env.NX_PG_WORKSPACE;
  if (env && env.trim()) {
    cachedWorkspace = resolve(env);
  } else {
    const store = await createStore('project-settings.json');
    const saved = await store.get('workspace');
    cachedWorkspace = saved ? resolve(saved) : DEFAULT_WORKSPACE;
    if (!existsSync(cachedWorkspace)) {
      await mkdir(cachedWorkspace, { recursive: true });
    }
  }
  return cachedWorkspace;
}

/**
 * 解析用户提供的路径为绝对路径，并校验在工作目录内。
 * 绝对路径：直接使用，但要求在工作目录下或子目录下。
 * 相对路径：相对工作目录解析。
 * 防 ../ 越界：用 normalize 后判定前缀。
 */
export async function resolveWorkspacePath(inputPath) {
  if (typeof inputPath !== 'string' || !inputPath) {
    throw badInput('path 必填');
  }
  let p = inputPath;
  // nx-pg：前端 vscode-uri 的 URI.toString() 会产生 file:///C:/... 形式（recent 列表、
  // GlobalMenu 最近文件、缩略图读取等都直接传它）。原版 Tauri fs 认这种 URL；
  // 这里的路径语义是纯文件系统路径，必须先剥掉 file:// 协议头，否则整个 URL
  // 被当成 workspace 下的相对目录名 → exists 恒 false → recent 记录被
  // validAndRefreshRecentFiles 当「文件丢失」清掉（实测：递归导入后列表立即变 NULL）。
  if (/^file:\/\//i.test(p)) {
    const { fileURLToPath } = await import('node:url');
    try {
      p = fileURLToPath(p);
    } catch {
      throw badInput(`无法解析 file:// URL: ${p}`);
    }
  }
  const workspace = await getWorkspace();
  const abs = isAbsolute(p) ? normalize(p) : normalize(resolve(workspace, p));
  const normWs = normalize(workspace) + sep;
  const normAbs = abs.endsWith(sep) ? abs : abs + sep;
  // Windows 盘符大小写不敏感：vscode-uri 的 URI.file() 会把 C:\ 归一成 c:\，
  // 与 server 持久化的 workspace（大写）前缀比对会误判越界，因此统一小写后再比。
  const cmp = (q) => (process.platform === 'win32' ? q.toLowerCase() : q);
  if (!cmp(normAbs).startsWith(cmp(normWs)) && cmp(abs) !== cmp(normalize(workspace))) {
    throw badInput(`路径越界：必须在工作目录 ${workspace} 下`);
  }
  return abs;
}
