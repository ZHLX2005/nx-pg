// 覆盖 canvas 模块：md 解析 / 树排版 / .prg 字节合法性 / action 输入校验。
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

process.env.NX_PG_STORE_DIR = resolve(process.cwd(), '.tmp-store');

const { parseMdTree } = await import('../../src/modules/canvas/parse.js');
const { layoutTree, estimateSize } = await import('../../src/modules/canvas/layout.js');
const { buildPrgBytes, PRG_VERSION } = await import('../../src/modules/canvas/prg.js');

// ---- parse ----

test('parse: 标题层级嵌套成树', () => {
  const { forest, warnings } = parseMdTree('# A\n## A1\n### A1a\n## A2\n# B');
  assert.equal(forest.length, 2);
  assert.equal(forest[0].title, 'A');
  assert.deepEqual(forest[0].children.map((c) => c.title), ['A1', 'A2']);
  assert.deepEqual(forest[0].children[0].children.map((c) => c.title), ['A1a']);
  assert.deepEqual(warnings, []);
});

test('parse: 多级列表按缩进嵌套（tab 与空格混用）', () => {
  const { forest } = parseMdTree('- a\n  - a1\n- b\n* c\n1. d\n2) e');
  // 顶级列表项各自成根
  assert.deepEqual(forest.map((c) => c.title), ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(forest[0].children.map((c) => c.title), ['a1']);
});

test('parse: 列表挂在最近标题下（标题→列表层级约定）', () => {
  const { forest } = parseMdTree('# 根\n- 顶层\n  - 二层\n## 子标题\n- 子下列表');
  assert.equal(forest.length, 1);
  const root = forest[0];
  assert.deepEqual(root.children.map((c) => c.title), ['顶层', '子标题']);
  // 顶层列表（depth 1）的二级列表（depth 2）是它的孩子
  assert.deepEqual(root.children[0].children.map((c) => c.title), ['二层']);
  // 子标题（depth 1）下的列表也是 depth 1+1 → 挂在子标题下
  assert.deepEqual(root.children[1].children.map((c) => c.title), ['子下列表']);
});

test('parse: checkbox 剥离、正文归最近节点', () => {
  const { forest } = parseMdTree('# 任务\n- [ ] 待办\n- [x] 完成\n\n说明文字');
  const task = forest[0];
  assert.deepEqual(task.children.map((c) => c.title), ['待办', '完成']);
  // 正文归属最近创建的节点（栈顶 = 最后一个列表项），而非所在标题
  assert.deepEqual(task.children[1].lines, ['说明文字']);
});

test('parse: 首段无归属正文被忽略并告警；空输入报错', () => {
  const { warnings } = parseMdTree('孤立文字\n# A');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /忽略无归属的正文/);
  assert.throws(() => parseMdTree(''), /md 内容为空/);
  assert.throws(() => parseMdTree('只有正文没有结构'), /未解析出任何节点/);
});

test('parse: 围栏代码块内容不参与结构', () => {
  const { forest } = parseMdTree('# A\n```\n# 不是标题\n```\n## B');
  assert.deepEqual(forest[0].children.map((c) => c.title), ['B']);
});

// ---- layout ----

const SAMPLE = parseMdTree('# 根\n## 一\n- a\n- b\n  - b1\n## 二\n# 另一棵').forest;

function overlaps(nodes) {
  let n = 0;
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) n++;
    }
  return n;
}

test('layout: lr 左右树零重叠、父子 x 单调', () => {
  const { nodes, edges } = layoutTree(SAMPLE, 'lr');
  assert.equal(overlaps(nodes), 0);
  for (const [p, c] of edges) {
    assert.ok(nodes[c].x > nodes[p].x, `子节点应在父右侧: ${nodes[c].x} vs ${nodes[p].x}`);
  }
});

test('layout: tb 上下树零重叠、父子 y 单调', () => {
  const { nodes, edges } = layoutTree(SAMPLE, 'tb');
  assert.equal(overlaps(nodes), 0);
  for (const [p, c] of edges) {
    assert.ok(nodes[c].y > nodes[p].y, `子节点应在父下方`);
  }
});

test('layout: 多顶级节点合成 root；坐标全正', () => {
  const { nodes } = layoutTree(SAMPLE, 'lr');
  assert.equal(nodes[0].text, 'root');
  for (const n of nodes) {
    assert.ok(n.x >= 100 && n.y >= 100, `坐标应为正: ${n.x},${n.y}`);
  }
});

test('estimateSize: CJK 全宽、多行加高', () => {
  const one = estimateSize('八个汉字宽度测试');
  const two = estimateSize('八个汉字宽度测试\n第二行');
  assert.ok(one.w > 8 * 32 * 0.9, 'CJK 按全宽估');
  assert.ok(two.h > one.h, '多行更高');
});

// ---- prg 字节 ----

async function zipEntries(bytes) {
  const { decode } = await import('@msgpack/msgpack');
  const { Uint8ArrayReader, Uint8ArrayWriter, ZipReader } = await import('@zip.js/zip.js');
  const entries = new Map();
  const reader = new ZipReader(new Uint8ArrayReader(bytes));
  for (const entry of await reader.getEntries()) {
    entries.set(entry.filename, decode(await entry.getData(new Uint8ArrayWriter())));
  }
  await reader.close();
  return entries;
}

test('prg: zip 结构、引用下标、metadata 版本全部合法', async () => {
  const { nodes, edges } = layoutTree(SAMPLE, 'lr');
  const bytes = await buildPrgBytes(nodes, edges, 'lr');
  const entries = await zipEntries(bytes);

  assert.deepEqual([...entries.keys()].sort(), ['metadata.msgpack', 'reference.msgpack', 'stage.msgpack', 'tags.msgpack']);
  assert.equal(entries.get('metadata.msgpack').version, PRG_VERSION);
  assert.deepEqual(entries.get('tags.msgpack'), []);
  assert.deepEqual(entries.get('reference.msgpack'), { sections: {}, files: [] });

  const stage = entries.get('stage.msgpack');
  assert.equal(stage.length, nodes.length + edges.length);
  const textNodes = stage.filter((s) => s._ === 'TextNode');
  assert.equal(textNodes.length, nodes.length);
  for (const n of textNodes) {
    for (const k of ['uuid', 'text', 'details', 'collisionBox', 'color', 'sizeAdjust']) {
      assert.ok(k in n, `TextNode 缺字段 ${k}`);
    }
    assert.equal(n.sizeAdjust, 'auto');
  }
  // 引用必须 {"$":"/i"} 且指向 TextNode
  for (const e of stage.filter((s) => s._ === 'LineEdge')) {
    assert.equal(e.associationList.length, 2);
    for (const ref of e.associationList) {
      const i = Number(ref.$.slice(1));
      assert.ok(i >= 0 && i < nodes.length, `引用越界: ${ref.$}`);
      assert.equal(stage[i]._, 'TextNode');
    }
  }
});

test('prg: lr/tb 端点哨兵方向正确', async () => {
  const { nodes, edges } = layoutTree(parseMdTree('# a\n- b').forest, 'lr');
  const lrBytes = await buildPrgBytes(nodes, edges, 'lr');
  const lrEdge = (await zipEntries(lrBytes)).get('stage.msgpack').find((s) => s._ === 'LineEdge');
  assert.deepEqual(lrEdge.sourceRectangleRate, { _: 'Vector', x: 0.99, y: 0.5 });
  assert.deepEqual(lrEdge.targetRectangleRate, { _: 'Vector', x: 0.01, y: 0.5 });

  const tbLayout = layoutTree(parseMdTree('# a\n- b').forest, 'tb');
  const tbBytes = await buildPrgBytes(tbLayout.nodes, tbLayout.edges, 'tb');
  const tbEdge = (await zipEntries(tbBytes)).get('stage.msgpack').find((s) => s._ === 'LineEdge');
  assert.deepEqual(tbEdge.sourceRectangleRate, { _: 'Vector', x: 0.5, y: 0.99 });
  assert.deepEqual(tbEdge.targetRectangleRate, { _: 'Vector', x: 0.5, y: 0.01 });
  void lrBytes;
});

// ---- action 端到端（直调 run）----

test('canvas.dag: 内联文本 → workspace 落盘 → 重名追加序号', async () => {
  const ws = resolve(process.cwd(), '.tmp-workspace-canvas');
  process.env.NX_PG_WORKSPACE = ws;
  const { default: canvas } = await import('../../src/modules/canvas/index.js');
  const find = (id) => canvas.actions.find((a) => a.id === id);

  try {
    const r1 = await find('canvas.dag').run(
      { text: '# 计划\n## 步骤\n- 先做这个', dir: 'lr' },
      { transport: 'http' },
    );
    assert.match(r1.path, /计划\.prg$/);
    assert.equal(r1.nodes, 3);
    assert.equal(r1.edges, 2);

    const r2 = await find('canvas.dag').run(
      { text: '# 计划\n## 步骤\n- 再来一次', dir: 'tb' },
      { transport: 'http' },
    );
    assert.match(r2.path, /计划-2\.prg$/);

    const r3 = await find('canvas.dag').run({ text: '# 计划', dir: 'lr' }, { transport: 'http' });
    assert.match(r3.path, /计划-3\.prg$/);
  } finally {
    rmSync(ws, { recursive: true, force: true });
    delete process.env.NX_PG_WORKSPACE;
  }
});

test('canvas.dag: 缺输入报错；stdin 仅限 CLI；dir enum 校验在 spec 层', async () => {
  const ws = resolve(process.cwd(), '.tmp-workspace-canvas-2');
  process.env.NX_PG_WORKSPACE = ws;
  const { default: canvas } = await import('../../src/modules/canvas/index.js');
  const find = (id) => canvas.actions.find((a) => a.id === id);

  try {
    await assert.rejects(() => find('canvas.dag').run({}, { transport: 'http' }), /缺少输入/);
    await assert.rejects(
      () => find('canvas.dag').run({ text: '-' }, { transport: 'http' }),
      /仅支持 CLI/,
    );
  } finally {
    rmSync(ws, { recursive: true, force: true });
    delete process.env.NX_PG_WORKSPACE;
  }
});

test('canvas.dag: 多块 dag（--- 分隔）并排独立成树；单行块 = 独立节点', async () => {
  const ws = resolve(process.cwd(), '.tmp-workspace-canvas-3');
  process.env.NX_PG_WORKSPACE = ws;
  const { default: canvas } = await import('../../src/modules/canvas/index.js');
  const find = (id) => canvas.actions.find((a) => a.id === id);

  try {
    const r = await find('canvas.dag').run(
      { text: '# A\n- a1\n---\n# B\n---\n独立节点', dir: 'lr' },
      { transport: 'http' },
    );
    assert.equal(r.blocks, 3);
    // A(2 节点) + B(1) + 独立节点(1) = 4，边 1+0+0 = 1
    assert.equal(r.nodes, 4);
    assert.equal(r.edges, 1);
  } finally {
    rmSync(ws, { recursive: true, force: true });
    delete process.env.NX_PG_WORKSPACE;
  }
});

test('canvas.export: md 往返（dag 生成 → 导出同构层级）', async () => {
  const ws = resolve(process.cwd(), '.tmp-workspace-canvas-4');
  process.env.NX_PG_WORKSPACE = ws;
  const { default: canvas } = await import('../../src/modules/canvas/index.js');
  const find = (id) => canvas.actions.find((a) => a.id === id);

  try {
    await find('canvas.dag').run({ text: '# 根\n## 子\n- 叶', dir: 'lr', name: 'rt' }, { transport: 'http' });
    const r = await find('canvas.export').run({ file: 'rt.prg', format: 'md' }, { transport: 'http' });
    assert.equal(r.path.endsWith('rt.prg'), true);
    assert.equal(r.md, '# 根\n## 子\n### 叶');
  } finally {
    rmSync(ws, { recursive: true, force: true });
    delete process.env.NX_PG_WORKSPACE;
  }
});

test('canvas.export: json 形状输出节点坐标与边', async () => {
  const ws = resolve(process.cwd(), '.tmp-workspace-canvas-5');
  process.env.NX_PG_WORKSPACE = ws;
  const { default: canvas } = await import('../../src/modules/canvas/index.js');
  const find = (id) => canvas.actions.find((a) => a.id === id);

  try {
    await find('canvas.dag').run({ text: '# 根\n- 叶', dir: 'lr', name: 'rj' }, { transport: 'http' });
    const r = await find('canvas.export').run({ file: 'rj.prg', format: 'json' }, { transport: 'http' });
    assert.equal(r.nodes.length, 2);
    assert.equal(r.edges.length, 1);
    for (const n of r.nodes) {
      for (const k of ['uuid', 'text', 'x', 'y', 'w', 'h']) assert.ok(k in n);
    }
    assert.equal(r.edges[0].source, 0);
    assert.equal(r.edges[0].target, 1);
  } finally {
    rmSync(ws, { recursive: true, force: true });
    delete process.env.NX_PG_WORKSPACE;
  }
});

test('canvas.active: report → get 往返', async () => {
  const { default: canvas } = await import('../../src/modules/canvas/index.js');
  const find = (id) => canvas.actions.find((a) => a.id === id);
  const set = await find('canvas.active.set').run(
    { path: 'C:/x/demo.prg', name: 'demo.prg' },
    { transport: 'http' },
  );
  assert.equal(set.active.path, 'C:/x/demo.prg');
  const get = await find('canvas.active.get').run({}, { transport: 'http' });
  assert.equal(get.active.name, 'demo.prg');
  assert.ok(get.active.at);
});

test('canvas.export: 越界路径被拒', async () => {
  const { default: canvas } = await import('../../src/modules/canvas/index.js');
  const find = (id) => canvas.actions.find((a) => a.id === id);
  await assert.rejects(
    () => find('canvas.export').run({ file: '../x.prg', format: 'md' }, { transport: 'http' }),
    /路径越界/,
  );
});

// ---- B05 多行输入：spawnSync 直达 stdin（不经过 shell，测 CLI 的 stdin 路径本身）----

test('canvas.dag: stdin(-) heredoc 多行逐字节保留、后续 flag 生效', async () => {
  // 注意：getWorkspace 有模块级缓存，主进程里第一个 canvas 测试已把 workspace
  // 定死（.tmp-workspace-canvas）。spawnSync 子进程是独立进程、无缓存，会用
  // 当前 env 的 workspace——两边必须指向同一个目录才断言得上。
  const ws = resolve(process.cwd(), '.tmp-workspace-canvas');
  process.env.NX_PG_WORKSPACE = ws;
  const { spawnSync } = await import('node:child_process');
  const md = '# stdin 树\n- 叶一\n\n- 叶二'; // 含空行
  try {
    const r = spawnSync(
      process.execPath,
      [resolve(process.cwd(), 'bin/pg.mjs'), 'canvas', 'dag', '-', '--dir', 'lr', '--name', 'stdin-test'],
      { input: md, encoding: 'utf8', timeout: 30000 },
    );
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.match(r.stdout, /3 节点/);
    assert.match(r.stdout, /stdin-test\.prg/);
    // 内容逐字节保留：导出对比（主进程读同一 workspace 的产物）
    const { default: canvas } = await import('../../src/modules/canvas/index.js');
    const find = (id) => canvas.actions.find((a) => a.id === id);
    const out = await find('canvas.export').run({ file: 'stdin-test.prg', format: 'md' }, { transport: 'http' });
    assert.equal(out.md, '# stdin 树\n## 叶一\n## 叶二');
  } finally {
    rmSync(join(ws, 'stdin-test.prg'), { force: true });
    delete process.env.NX_PG_WORKSPACE;
  }
});

test('canvas.dag: 空 stdin 报错并带 heredoc 用法示例，不建文件', async () => {
  const ws = resolve(process.cwd(), '.tmp-workspace-canvas-stdin2');
  process.env.NX_PG_WORKSPACE = ws;
  const { spawnSync } = await import('node:child_process');
  try {
    const r = spawnSync(
      process.execPath,
      [resolve(process.cwd(), 'bin/pg.mjs'), 'canvas', 'dag', '-'],
      { input: '', encoding: 'utf8', timeout: 30000 },
    );
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /stdin 为空/);
    assert.match(r.stderr, /heredoc/);
    assert.equal(existsSync(join(ws, 'canvas-dag.prg')), false);
  } finally {
    rmSync(ws, { recursive: true, force: true });
    delete process.env.NX_PG_WORKSPACE;
  }
});

// ---- canvas inject：注入队列 ----

test('canvas.inject: 提交 → fetch take-all → 队列清空', async () => {
  const ws = resolve(process.cwd(), '.tmp-workspace-inject');
  process.env.NX_PG_WORKSPACE = ws;
  const { default: canvas } = await import('../../src/modules/canvas/index.js');
  const find = (id) => canvas.actions.find((a) => a.id === id);

  try {
    const r1 = await find('canvas.inject').run(
      { text: '# 注入树\n- 叶子', dir: 'lr' },
      { transport: 'http' },
    );
    assert.equal(r1.queued, true);
    assert.equal(r1.nodes, 2);
    assert.equal(r1.edges, 1);

    // 第二条也入队
    await find('canvas.inject').run({ text: '独立节点' }, { transport: 'http' });

    // fetch take-all：两条全取走
    const out = await find('canvas.inject.fetch').run({}, { transport: 'http' });
    assert.equal(out.items.length, 2);
    assert.match(out.items[0].md, /注入树/);
    assert.ok(out.items[0].id);
    assert.ok(out.items[0].at);

    // 再 fetch：空
    const out2 = await find('canvas.inject.fetch').run({}, { transport: 'http' });
    assert.equal(out2.items.length, 0);
  } finally {
    rmSync(ws, { recursive: true, force: true });
    delete process.env.NX_PG_WORKSPACE;
  }
});

test('canvas.inject: 缺输入报错；超长 md 被拒', async () => {
  const ws = resolve(process.cwd(), '.tmp-workspace-inject-2');
  process.env.NX_PG_WORKSPACE = ws;
  const { default: canvas } = await import('../../src/modules/canvas/index.js');
  const find = (id) => canvas.actions.find((a) => a.id === id);

  try {
    await assert.rejects(() => find('canvas.inject').run({}, { transport: 'http' }), /缺少输入/);
    await assert.rejects(
      () => find('canvas.inject').run({ text: '# x\n' + '- 叶\n'.repeat(60 * 1024) }, { transport: 'http' }),
      /过大/,
    );
  } finally {
    rmSync(ws, { recursive: true, force: true });
    delete process.env.NX_PG_WORKSPACE;
  }
});
