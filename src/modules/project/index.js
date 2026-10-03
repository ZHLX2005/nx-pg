// project 域：.prg 文件读写、目录管理、最近文件列表。
//
// 设计约定：fs/recent 操作都围绕"工作目录"概念。用户首次启动时 server
// 在用户目录下建一个 ~/.nx-pg/workspace/（或环境变量 NX_PG_WORKSPACE），
// 所有 .prg 文件在此目录下。一切 path 输入都解析为相对工作目录或绝对路径，
// 路径白名单由 resolveWorkspacePath 守住（实现在 core/workspace.js，与 canvas 模块共享）。
import { readFile, writeFile, mkdir, readdir, rename, stat, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { sep, dirname, basename } from 'node:path';
import { createStore } from '../../core/store.js';
import { getWorkspace, resolveWorkspacePath } from '../../core/workspace.js';

export default {
  id: 'project',
  title: '工程文件',
  order: 10,

  actions: [
    {
      id: 'project.workspace',
      cli: ['project', 'workspace'],
      http: ['GET', '/api/project/workspace'],
      summary: '返回工作目录（workspace root）',
      run: async () => {
        const workspace = await getWorkspace();
        return { path: workspace, isDefault: !process.env.NX_PG_WORKSPACE };
      },
      render: (r) => `${r.path}${r.isDefault ? '    （默认 ~/.nx-pg/workspace）' : ''}`,
    },

    {
      id: 'project.fs.read',
      cli: ['project', 'fs', 'read'],
      http: ['GET', '/api/project/fs/read'],
      summary: '读取 .prg / 任意文件字节（query: path）',
      flags: { path: { type: 'string', required: true } },
      run: async (ctx) => {
        const abs = await resolveWorkspacePath(ctx.path);
        // 返回 base64 让 JSON 能装下二进制
        const buf = await readFile(abs);
        return {
          path: abs,
          size: buf.length,
          dataB64: buf.toString('base64'),
        };
      },
      render: (r) => `${r.path}    ${r.size} bytes`,
    },

    {
      id: 'project.fs.write',
      cli: ['project', 'fs', 'write'],
      http: ['POST', '/api/project/fs/write'],
      summary: '写入字节（body: { path, dataB64 }）',
      flags: { path: { type: 'string', required: true }, b64: { type: 'string', required: true } },
      run: async (ctx) => {
        const abs = await resolveWorkspacePath(ctx.path);
        await mkdir(dirname(abs), { recursive: true });
        const buf = Buffer.from(ctx.b64, 'base64');
        await writeFile(abs, buf);
        return { path: abs, size: buf.length };
      },
      render: (r) => `wrote ${r.size} bytes -> ${r.path}`,
    },

    {
      id: 'project.fs.exists',
      cli: ['project', 'fs', 'exists'],
      http: ['GET', '/api/project/fs/exists'],
      summary: '判断路径是否存在',
      flags: { path: { type: 'string', required: true } },
      run: async (ctx) => {
        const abs = await resolveWorkspacePath(ctx.path);
        return { path: abs, exists: existsSync(abs) };
      },
    },

    {
      id: 'project.fs.mkdir',
      cli: ['project', 'fs', 'mkdir'],
      http: ['POST', '/api/project/fs/mkdir'],
      summary: '建目录（递归）',
      flags: { path: { type: 'string', required: true } },
      run: async (ctx) => {
        const abs = await resolveWorkspacePath(ctx.path);
        await mkdir(abs, { recursive: true });
        return { path: abs };
      },
    },

    {
      id: 'project.fs.readdir',
      cli: ['project', 'fs', 'readdir'],
      http: ['GET', '/api/project/fs/readdir'],
      summary: '列目录条目（path 可选；空 = 工作目录）',
      flags: { path: { type: 'string', required: false } },
      run: async (ctx) => {
        const target = ctx.path ? await resolveWorkspacePath(ctx.path) : await getWorkspace();
        const entries = await readdir(target, { withFileTypes: true });
        return {
          path: target,
          entries: entries
            .map((e) => ({
              name: e.name,
              isDirectory: e.isDirectory(),
              isFile: e.isFile(),
              isSymlink: e.isSymbolicLink(),
            }))
            .sort((a, b) => (a.isDirectory === b.isDirectory ? a.name.localeCompare(b.name) : a.isDirectory ? -1 : 1)),
        };
      },
      render: (r) => r.entries.map((e) => `  ${e.isDirectory ? '📁' : '📄'} ${e.name}`).join('\n') || '(空)',
    },

    {
      id: 'project.fs.rename',
      cli: ['project', 'fs', 'rename'],
      http: ['POST', '/api/project/fs/rename'],
      summary: '重命名 / 移动',
      flags: { from: { type: 'string', required: true }, to: { type: 'string', required: true } },
      run: async (ctx) => {
        const a = await resolveWorkspacePath(ctx.from);
        const b = await resolveWorkspacePath(ctx.to);
        await rename(a, b);
        return { from: a, to: b };
      },
    },

    {
      id: 'project.fs.remove',
      cli: ['project', 'fs', 'remove'],
      http: ['POST', '/api/project/fs/remove'],
      summary: '删除文件或目录（递归）',
      flags: { path: { type: 'string', required: true } },
      run: async (ctx) => {
        const abs = await resolveWorkspacePath(ctx.path);
        const s = await stat(abs);
        if (s.isDirectory()) {
          // 不引入额外依赖：递归删除用 rm(Node 14.14+) 或 readdir+unlink
          await rmRecursive(abs);
        } else {
          await unlink(abs);
        }
        return { path: abs };
      },
    },

    {
      id: 'project.recent.list',
      cli: ['recent', 'list'],
      http: ['GET', '/api/recent/list'],
      summary: '列出最近打开的 .prg 文件',
      run: async () => {
        const store = await createStore('recent-files.json');
        const raw = (await store.get('files')) || [];
        return { files: Array.isArray(raw) ? raw : [] };
      },
      render: (r) => r.files.map((f, i) => `  ${i + 1}. ${f.path}`).join('\n') || '(无最近文件)',
    },

    {
      id: 'project.recent.add',
      cli: ['recent', 'add'],
      http: ['POST', '/api/recent/add'],
      summary: '添加最近打开的文件（path 必填）',
      flags: { path: { type: 'string', required: true } },
      run: async (ctx) => {
        const abs = await resolveWorkspacePath(ctx.path);
        const store = await createStore('recent-files.json');
        const files = ((await store.get('files')) || []).filter((f) => f.path !== abs);
        files.unshift({ path: abs, name: basename(abs), lastOpenedAt: new Date().toISOString() });
        // 上限 20 条
        await store.set('files', files.slice(0, 20));
        return { files: files.slice(0, 20) };
      },
    },

    {
      id: 'project.recent.remove',
      cli: ['recent', 'remove'],
      http: ['POST', '/api/recent/remove'],
      summary: '从最近文件列表删除一条',
      flags: { path: { type: 'string', required: true } },
      run: async (ctx) => {
        const abs = await resolveWorkspacePath(ctx.path);
        const store = await createStore('recent-files.json');
        const files = ((await store.get('files')) || []).filter((f) => f.path !== abs);
        await store.set('files', files);
        return { files };
      },
    },
  ],
};

// ---- helpers ----

async function rmRecursive(abs) {
  const { readdir: rd } = await import('node:fs/promises');
  const entries = await rd(abs, { withFileTypes: true });
  for (const e of entries) {
    const p = abs + sep + e.name;
    if (e.isDirectory()) await rmRecursive(p);
    else await unlink(p);
  }
  const { rmdir } = await import('node:fs/promises');
  await rmdir(abs);
}
