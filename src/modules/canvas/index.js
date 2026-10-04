// canvas 域：把结构化文本（md 多级列表）变成排版好的画布文件，并把画布内容
// 结构化输出给 AI——人机协作的闭环通道。
//
// 数据流（无轮询、无前端桥，纯请求-响应）：
//   AI:  nx-pg canvas dag --file plan.md        → 服务端生成 .prg 落盘 workspace
//   人:  点 CLI 打印的 URL                       → 画布打开排版好的树
//   AI:  nx-pg canvas export --file xxx.prg     → 读回结构化数据/md（上下文对接）
//   AI:  nx-pg canvas active --json             → 看人当前在看的文件（上下文对齐）
//   AI:  nx-pg canvas inject --file plan.md     → 树注入面板当前打开的画布（实时协作，
//                                                 前端 2s 拉取注入队列，见 CanvasInjectPoller）
//
// 多块 dag：输入按 --- / *** / ___ 分隔行切成多块，每块独立成树并排摆放、
// 互不连线；单行块 = 独立节点。追加式：每次生成新文件，绝不改既有文件。
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { badInput } from '../../core/errors/index.js';
import { getWorkspace, resolveWorkspacePath } from '../../core/workspace.js';
import { DEFAULT_PORT } from '../../core/paths.js';
import { parseMdTree } from './parse.js';
import { layoutTree } from './layout.js';
import { buildPrgBytes } from './prg.js';
import { readPrgGraph, readPrgMd } from './export.js';

// dag 块分隔行：--- / *** / ___（≥3 个），前后可有空白
const BLOCK_SPLIT_RE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;

// inject 队列约束：防 agent 失控刷队列
const INJECT_MAX_MD_BYTES = 256 * 1024; // 单条 md 上限
const INJECT_MAX_QUEUE = 20; // 队列长度上限（超出丢最旧）

async function getInjectStore() {
  const { createStore } = await import('../../core/store.js');
  return createStore('inject-queue.json');
}

// 重名文件自动追加序号：plan.prg → plan-2.prg → plan-3.prg
function dedupeName(workspace, name) {
  const safe = name.replace(/[\\/:*?"<>|]/g, '').trim() || 'canvas-dag';
  if (!safe.toLowerCase().endsWith('.prg')) return dedupeName(workspace, safe + '.prg');
  if (!existsSync(join(workspace, safe))) return safe;
  const stem = safe.slice(0, -4);
  for (let i = 2; i < 1000; i++) {
    const candidate = `${stem}-${i}.prg`;
    if (!existsSync(join(workspace, candidate))) return candidate;
  }
  throw badInput(`重名文件过多: ${safe}`);
}

// 首根标题 → 文件名（CJK/字母数字保留，其余折叠为 -）
function slugify(text) {
  const s = String(text)
    .trim()
    .replace(/[\s\p{P}\p{S}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return s || 'canvas-dag';
}

/** 读输入文本：--file > 位置参数 > -（stdin，仅 CLI） */
async function readInput(ctx, meta) {
  if (ctx.file) {
    // --file 是**输入**：任意磁盘路径可读（agent 常引用 workspace 外的笔记），
    // 白名单只约束**输出**落盘位置
    const { readFile } = await import('node:fs/promises');
    const { resolve } = await import('node:path');
    return readFile(resolve(ctx.file), 'utf8');
  }
  if (ctx.text === '-') {
    if (!meta || meta.transport !== 'cli') throw badInput('stdin 输入（text=-）仅支持 CLI');
    const { readFileSync } = await import('node:fs');
    if (process.stdin.isTTY) {
      throw badInput(
        "stdin 为终端。多行 md 推荐 heredoc: nx-pg canvas dag - --dir lr <<'EOF' + 换行写 md 后单独一行顶格 EOF；或用 --file <路径>",
      );
    }
    const md = readFileSync(0, 'utf8');
    if (!md.trim()) {
      throw badInput(
        "stdin 为空。多行 md 推荐 heredoc: nx-pg canvas dag - --dir lr <<'EOF' + 换行写 md 后单独一行顶格 EOF；或用 --file <路径>",
      );
    }
    return md;
  }
  if (typeof ctx.text === 'string' && ctx.text.trim()) return ctx.text;
  throw badInput('缺少输入：传位置参数 <text>、--file <路径>，或 CLI 下 text=- 走 stdin');
}

export default {
  id: 'canvas',
  title: '画布生成',
  order: 20,

  actions: [
    {
      id: 'canvas.dag',
      cli: ['canvas', 'dag'],
      http: ['POST', '/api/canvas/dag'],
      summary: '提交 md 多级列表 → 生成排版好的树 .prg（--- 分隔多块 dag；单行 = 独立节点）',
      args: [{ name: 'text', required: false }],
      flags: {
        file: { type: 'string', hint: 'path' },
        dir: { type: 'string', enum: ['lr', 'tb'], default: 'lr' },
        name: { type: 'string', hint: '文件名' },
        open: { type: 'boolean' },
      },
      run: async (ctx, meta) => {
        const md = await readInput(ctx, meta);

        // 多块切分：每块独立成树。单行块（无标题无列表）= 独立节点。
        const blocks = md
          .split(/\r?\n/)
          .reduce(
            (acc, line) => {
              if (BLOCK_SPLIT_RE.test(line)) acc.push([]);
              else acc[acc.length - 1].push(line);
              return acc;
            },
            [[]],
          )
          .map((lines) => lines.join('\n').trim())
          .filter((b) => b);

        if (!blocks.length) throw badInput('输入为空');

        const warnings = [];
        const allNodes = [];
        const allEdges = [];
        let cursor = { x: 100, y: 100 };
        const blockNames = [];

        for (const block of blocks) {
          let forest;
          try {
            const r = parseMdTree(block);
            forest = r.forest;
            warnings.push(...r.warnings.map((w) => `[块${blockNames.length + 1}] ${w}`));
          } catch (e) {
            // 不是结构化 md（如单行文本）→ 当独立节点
            if (/未解析出任何节点/.test(e.message)) {
              forest = [{ title: block.replace(/\n/g, ' '), lines: [], children: [] }];
            } else {
              throw e;
            }
          }
          const layout = layoutTree(forest, ctx.dir, cursor);
          // 块内节点坐标已按 cursor 平移；下一块摆在本块右侧/下方（留块间距 160）
          const maxMain = Math.max(...layout.nodes.map((n) => (ctx.dir === 'tb' ? n.y + n.h : n.x + n.w)));
          if (ctx.dir === 'tb') {
            cursor = { x: cursor.x, y: maxMain + 160 };
          } else {
            // lr：块沿 y 并排（水平铺开更符合阅读）
            const maxCross = Math.max(...layout.nodes.map((n) => n.y + n.h));
            cursor = { x: cursor.x, y: maxCross + 160 };
          }
          const base = allNodes.length;
          for (const n of layout.nodes) allNodes.push(n);
          for (const [p, c] of layout.edges) allEdges.push([p + base, c + base]);
          blockNames.push(forest.length === 1 ? forest[0].title : `root(${forest.length}块)`);
        }

        const bytes = await buildPrgBytes(allNodes, allEdges, ctx.dir);

        // 落盘 workspace（重名追加序号；输出路径过白名单守卫）
        const workspace = await getWorkspace();
        const fileName = dedupeName(workspace, ctx.name || slugify(blockNames[0]));
        const abs = await resolveWorkspacePath(fileName);
        await mkdir(dirname(abs), { recursive: true }); // env 指定的 workspace 可能不存在
        await writeFile(abs, bytes);
        return {
          path: abs,
          name: fileName,
          dir: ctx.dir,
          blocks: blocks.length,
          nodes: allNodes.length,
          edges: allEdges.length,
          warnings,
        };
      },
      render: (r) => {
        const dirLabel = r.dir === 'tb' ? '上下树' : '左右树';
        const lines = [
          `已生成 ${r.path}（${r.blocks} 块 / ${r.nodes} 节点 / ${r.edges} 连线，${dirLabel}）`,
          `打开: http://127.0.0.1:${DEFAULT_PORT}/?open=${encodeURIComponent(r.name)}（先 nx-pg serve）`,
          `或注入当前画布: nx-pg canvas inject --file <md路径>`,
        ];
        for (const w of r.warnings) lines.push(`提示: ${w}`);
        return lines.join('\n');
      },
    },

    {
      id: 'canvas.export',
      cli: ['canvas', 'export'],
      http: ['POST', '/api/canvas/export'],
      summary: '读 .prg 结构化输出（--format md 层级文本可再导回；--format json 全量数据）',
      flags: {
        file: { type: 'string', required: true, hint: 'path' },
        format: { type: 'string', enum: ['md', 'json'], default: 'md' },
        dir: { type: 'string', enum: ['lr', 'tb'], default: 'lr' },
      },
      run: async (ctx) => {
        // 输入文件限 workspace 内（.prg 属于用户数据，与 dag 的外部输入相反）
        const abs = await resolveWorkspacePath(ctx.file);
        if (ctx.format === 'json') {
          const { nodes, edges } = await readPrgGraph(abs);
          return { path: abs, nodes, edges };
        }
        const { md, warnings } = await readPrgMd(abs, ctx.dir);
        return { path: abs, md, warnings };
      },
      render: (r) => (r.md !== undefined ? r.md : `${r.nodes.length} 节点 / ${r.edges.length} 连线`),
    },

    {
      id: 'canvas.active.get',
      cli: ['canvas', 'active'],
      http: ['GET', '/api/canvas/active'],
      summary: '查看主面板当前激活的 prg（前端上报；未上报时返回空）',
      run: async () => {
        const { createStore } = await import('../../core/store.js');
        const store = await createStore('canvas-active.json');
        const active = await store.get('active');
        return { active: active || null };
      },
      render: (r) => (r.active ? `${r.active.path}（${r.active.at}）` : '(面板未上报激活文件)'),
    },

    {
      // 前端在 activeTabAtom 变化时 fire-and-forget POST 上报；CLI 形态保留给测试/调试
      id: 'canvas.active.set',
      cli: ['canvas', 'active', 'report'],
      http: ['POST', '/api/canvas/active'],
      summary: '上报主面板当前激活的 prg（前端自动调用；body: { path, name }）',
      flags: {
        path: { type: 'string', required: true },
        name: { type: 'string', required: false },
      },
      run: async (ctx) => {
        const { createStore } = await import('../../core/store.js');
        const store = await createStore('canvas-active.json');
        const active = { path: ctx.path, name: ctx.name || basename(ctx.path), at: new Date().toISOString() };
        await store.set('active', active);
        return { active };
      },
    },

    {
      // 实时注入：md → 前端注入队列（不落盘 .prg）。前端 CanvasInjectPoller 每 2s
      // GET /api/canvas/inject take-all，用 generateNodeByMarkdown 注入当前画布。
      // 传 md 原文而非布局坐标：前端 MarkdownImporter 自带 autoLayout，更贴合当前画布。
      id: 'canvas.inject',
      cli: ['canvas', 'inject'],
      http: ['POST', '/api/canvas/inject'],
      summary: '把 md 树注入面板当前打开的画布（不落盘；队列制，前端自动拉取）',
      args: [{ name: 'text', required: false }],
      flags: {
        file: { type: 'string', hint: 'path' },
        dir: { type: 'string', enum: ['lr', 'tb'], default: 'lr' },
      },
      run: async (ctx, meta) => {
        const md = await readInput(ctx, meta);
        if (Buffer.byteLength(md, 'utf8') > INJECT_MAX_MD_BYTES) {
          throw badInput(`注入内容过大（${Buffer.byteLength(md, 'utf8')} bytes > ${INJECT_MAX_MD_BYTES}）`);
        }

        // 只为统计节点/连线数（返回值给 CLI 确认用），布局结果不传给前端。
        // 单行文本（非结构化 md）按 dag 同款语义当独立节点。
        let nodes = 1;
        let edges = 0;
        try {
          const r = parseMdTree(md);
          const layout = layoutTree(r.forest, ctx.dir, { x: 0, y: 0 });
          nodes = layout.nodes.length;
          edges = layout.edges.length;
        } catch (e) {
          if (!/未解析出任何节点/.test(e.message)) throw e;
        }

        const store = await getInjectStore();
        const queue = ((await store.get('items')) || []).slice(-(INJECT_MAX_QUEUE - 1));
        const item = {
          id: crypto.randomUUID(),
          at: new Date().toISOString(),
          dir: ctx.dir,
          md,
          nodes,
          edges,
        };
        queue.push(item);
        await store.set('items', queue);

        // 附带面板当前激活画布，让 CLI 能提示注入目标
        const activeStore = await import('../../core/store.js').then((m) => m.createStore('canvas-active.json'));
        const active = await activeStore.get('active');
        return { queued: true, id: item.id, nodes: item.nodes, edges: item.edges, target: active || null };
      },
      render: (r) => {
        const lines = [
          `已提交注入队列（${r.nodes} 节点 / ${r.edges} 连线），前端将在 2s 内注入当前画布`,
          r.target ? `目标: ${r.target.name || r.target.path}` : '目标: 面板当前激活画布（未上报则注入会丢弃）',
        ];
        for (const w of r.warnings || []) lines.push(`提示: ${w}`);
        return lines.join('\n');
      },
    },

    {
      // 前端轮询拉取（take-all：取走即清空）；CLI 形态保留给测试/调试
      id: 'canvas.inject.fetch',
      cli: ['canvas', 'inject', 'fetch'],
      http: ['GET', '/api/canvas/inject'],
      summary: '取走注入队列全部条目（take-all；前端轮询调用）',
      run: async () => {
        const store = await getInjectStore();
        const items = (await store.get('items')) || [];
        await store.set('items', []);
        return { items };
      },
      render: (r) =>
        r.items.length
          ? r.items.map((it) => `  [${it.at}] ${it.nodes} 节点（${it.dir}）`).join('\n')
          : '(队列为空)',
    },
  ],
};
