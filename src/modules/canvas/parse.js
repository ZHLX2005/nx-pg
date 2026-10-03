// Markdown → 森林解析（纯函数，Node 侧无 DOM 依赖）。
//
// 层级语义（用户约定）：多级标题 → 正文 → 多级列表，缩进嵌套天然成树（无环）。
//   # 一级          → depth 0
//   ## 二级         → depth 1（父 = 最近的更浅标题）
//   - 列表项         → depth = 最近标题深度 + 1 + 缩进级
//   正文行           → 归属最近节点的 lines（不产生节点）
//
// 剥离：列表标记 - * + / 1. / 1)、checkbox [ ] [x]。
// 缩进归一：tab 视为 4 空格；unit 取全部列表行最小正缩进；level = floor(indent / unit)。
import { badInput } from '../../core/errors/index.js';

const MAX_DEPTH = 200;

// 列表标记：无序（- * +）、有序（1. / 1)）。checkbox 单独剥。
const LIST_RE = /^([-*+])\s+/;
const ORDERED_RE = /^(\d{1,9})([.)])\s+/;
const CHECKBOX_RE = /^\[( |x|X)\]\s+/;
// 围栏代码块：``` 之间的行不参与结构解析
const FENCE_RE = /^\s*(```|~~~)/;

/** 剥掉行首列表标记与 checkbox，返回纯文字 */
export function stripListMarker(line) {
  let s = line;
  const m = s.match(LIST_RE) || s.match(ORDERED_RE);
  if (m) s = s.slice(m[0].length);
  const cb = s.match(CHECKBOX_RE);
  if (cb) s = s.slice(cb[0].length);
  return s.trim();
}

/** 判断一行是否为列表项（允许前导缩进；剥离标记前的检测） */
export function isListItem(line) {
  const s = line.replace(/^[ \t]+/, '');
  return LIST_RE.test(s) || ORDERED_RE.test(s);
}

/**
 * 解析 markdown 为森林。返回 { forest, warnings }：
 *   forest: [{ title, lines: string[], children: [] }]（children 同构递归）
 *   warnings: string[]（不影响成功，如首段正文被忽略）
 */
export function parseMdTree(md) {
  if (typeof md !== 'string' || !md.trim()) throw badInput('md 内容为空');
  const lines = md.split(/\r?\n/);
  const warnings = [];

  // 首个标题/列表之前的正文没有归属，忽略并提示
  let started = false;
  let inFence = false;

  // 单调栈：[{ node, depth }]，depth 严格递增。新节点 pop 到合法父级再 push。
  const stack = [];
  const forest = [];

  // 列表行用「最近标题深度 + 缩进级」定深度。记录最近标题深度。
  let lastHeadingDepth = -1;
  // 列表缩进 unit：全部列表行里最小的正缩进
  const listIndents = [];

  // ---- 第一遍：识别行类型与缩进，暂存为 token ----
  const tokens = [];
  for (const raw of lines) {
    if (FENCE_RE.test(raw)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue; // 代码块内容不做结构解析
    const heading = raw.match(/^(#{1,})\s+(.*)$/);
    if (heading) {
      tokens.push({ kind: 'heading', depth: heading[1].length - 1, title: heading[2].trim() });
      continue;
    }
    if (isListItem(raw)) {
      const expanded = raw.replace(/\t/g, '    ');
      const indent = expanded.length - expanded.trimStart().length;
      tokens.push({ kind: 'list', indent, title: stripListMarker(expanded.trim()) });
      continue;
    }
    tokens.push({ kind: 'text', text: raw.trim() });
  }

  // ---- 缩进 unit：全部列表行最小正缩进 ----
  for (const t of tokens) {
    if (t.kind === 'list' && t.indent > 0) listIndents.push(t.indent);
  }
  const unit = listIndents.length ? Math.min(...listIndents) : 4;

  // ---- 第二遍：按单调栈建树 ----
  for (const t of tokens) {
    let depth;
    if (t.kind === 'heading') {
      depth = t.depth;
      lastHeadingDepth = t.depth;
    } else if (t.kind === 'list') {
      const level = t.indent > 0 ? Math.floor(t.indent / unit) : 0;
      depth = lastHeadingDepth + 1 + level;
    } else {
      // 正文行：归属栈顶节点的 lines；栈空（首段正文）→ 忽略 + warning
      if (!started) {
        if (t.text) warnings.push(`忽略无归属的正文: ${t.text.slice(0, 20)}`);
        continue;
      }
      const top = stack[stack.length - 1];
      if (top && t.text) top.node.lines.push(t.text);
      continue;
    }
    started = true;
    const node = { title: t.title, lines: [], children: [] };
    // pop 到第一个比当前浅的
    while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
    if (stack.length) {
      stack[stack.length - 1].node.children.push(node);
    } else {
      forest.push(node);
    }
    stack.push({ node, depth });
    if (depth > MAX_DEPTH) throw badInput(`嵌套过深（>${MAX_DEPTH} 层）`);
  }

  if (!forest.length) throw badInput('未解析出任何节点（需要标题或列表行）');
  return { forest, warnings };
}
