// .prg → 结构化数据（供 AI 读画布上下文）。
//
// 兼容性说明：keepNames 修复（本轮）之前的旧存档里类名是压缩名（如 "Le"），
// 所以这里**不按 `._` 类名**识别，按形状识别：
//   - 节点：有 text + collisionBox（TextNode 形状）
//   - 连线：有 associationList 且元素是 {$} 引用（LineEdge 形状）
// 输出两种形态：
//   - json：节点/连线全量数据（uuid/文本/坐标）
//   - md：层级文本（与 canvas.dag 的输入同构——AI 可改完直接导回，闭环）
import { readFileSync } from 'node:fs';
import { decode } from '@msgpack/msgpack';
import { Uint8ArrayReader, Uint8ArrayWriter, ZipReader } from '@zip.js/zip.js';
import { badInput } from '../../core/errors/index.js';

async function readStageMsgpack(abs) {
  let bytes;
  try {
    bytes = readFileSync(abs);
  } catch {
    throw badInput(`无法读取文件: ${abs}`);
  }
  const reader = new ZipReader(new Uint8ArrayReader(new Uint8Array(bytes)));
  const entries = new Map();
  for (const e of await reader.getEntries()) {
    entries.set(e.filename, await e.getData(new Uint8ArrayWriter()));
  }
  await reader.close();
  const stageBytes = entries.get('stage.msgpack');
  if (!stageBytes) throw badInput(`不是合法的 .prg（缺少 stage.msgpack）: ${abs}`);
  return decode(stageBytes);
}

const isRef = (v) => v && typeof v === 'object' && '$' in v;
const refIndex = (v) => Number(String(v.$).slice(1));

/** 抽取节点与连线（形状识别，兼容压缩类名存档） */
export function extractGraph(stage) {
  const nodeIdx = []; // stage 下标 → 节点序号
  const nodes = [];
  const edges = [];

  stage.forEach((obj, i) => {
    if (
      obj &&
      typeof obj === 'object' &&
      typeof obj.text === 'string' &&
      obj.collisionBox?.shapes?.[0]?.location &&
      obj.collisionBox?.shapes?.[0]?.size
    ) {
      nodeIdx[i] = nodes.length;
      const loc = obj.collisionBox.shapes[0].location;
      const size = obj.collisionBox.shapes[0].size;
      nodes.push({
        stageIndex: i,
        uuid: obj.uuid,
        text: obj.text,
        x: loc.x,
        y: loc.y,
        w: size.x,
        h: size.y,
      });
    }
  });

  stage.forEach((obj) => {
    if (
      obj &&
      typeof obj === 'object' &&
      Array.isArray(obj.associationList) &&
      obj.associationList.length === 2 &&
      obj.associationList.every(isRef)
    ) {
      const [s, t] = obj.associationList.map(refIndex);
      if (nodeIdx[s] !== undefined && nodeIdx[t] !== undefined) {
        edges.push({ source: nodeIdx[s], target: nodeIdx[t] });
      }
    }
  });

  return { nodes, edges };
}

/**
 * 图 → md 层级文本。按几何位置重建层级：
 *   - 找入度 0 的节点为根（多根允许）
 *   - 子节点 = 出边目标，按 y 排序（lr）/ x 排序（tb）
 *   - 正文（text 含换行）拆为首行标题 + 其余正文
 * 环不可能出现（画布允许环，但导出按访问标记防死循环，环边记 warning 忽略）。
 */
export function graphToMd(nodes, edges, dir = 'lr') {
  const children = nodes.map(() => []);
  const hasParent = nodes.map(() => false);
  for (const e of edges) {
    children[e.source].push(e.target);
    hasParent[e.target] = true;
  }
  const lines = [];
  const warnings = [];
  const visited = new Set();

  function emit(n, depth) {
    if (visited.has(n)) {
      warnings.push(`忽略环边指向的节点: ${nodes[n].text.slice(0, 20)}`);
      return;
    }
    visited.add(n);
    const rows = nodes[n].text.split('\n');
    lines.push('#'.repeat(Math.min(depth + 1, 6)) + ' ' + rows[0]);
    for (const row of rows.slice(1)) lines.push(row);
    const sorted = [...children[n]].sort((a, b) =>
      dir === 'lr' ? nodes[a].y - nodes[b].y : nodes[a].x - nodes[b].x,
    );
    for (const c of sorted) emit(c, depth + 1);
  }

  for (let i = 0; i < nodes.length; i++) {
    if (!hasParent[i]) emit(i, 0);
  }
  // 孤儿环（所有节点都有父的环）兜底
  for (let i = 0; i < nodes.length; i++) {
    if (!visited.has(i)) emit(i, 0);
  }
  return { md: lines.join('\n'), warnings };
}

/** 读 .prg 并返回图结构 */
export async function readPrgGraph(abs) {
  const stage = await readStageMsgpack(abs);
  return { stage, ...extractGraph(stage) };
}

/** 读 .prg 并返回 md 层级文本 */
export async function readPrgMd(abs, dir = 'lr') {
  const { nodes, edges } = await readPrgGraph(abs);
  return graphToMd(nodes, edges, dir);
}
