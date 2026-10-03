// 树排版（纯函数）：森林 → 节点矩形 + 边，供 prg.js 生成实体坐标。
//
// 两个方向：
//   lr 左右树：深度 = 列（x 递增），兄弟按 y 排；父在子跨度内垂直居中
//   tb 上下树：深度 = 行（y 递增），兄弟按 x 排；父在子跨度内水平居中
//
// 不重叠的两个保证：
//   交叉轴——子树 span = max(自身尺寸, 子跨度和+gap)，cursor 按 span 累加，兄弟区间不相交；
//   主轴——按深度分层，层内主轴坐标相同，列宽 = 该层最大尺寸，层间 gap 固定。
//
// 尺寸是**估算**——TextNode sizeAdjust:"auto" 会让前端按文字实测重算框体，
// 这里只需保证间距足够（SAFETY 系数吸收估算偏差）。

const FONT = 32; // Renderer.FONT_SIZE
const CHAR_W = { cjk: FONT, ascii: FONT * 0.55 };
const PAD = 28; // NODE_PADDING*2 附近
const LINE_H = 48; // 行高（多行正文）
const MIN_W = 75;
const GAP_MAIN = 90; // 深度方向父子层间距
const GAP_CROSS = 30; // 兄弟间距
const SAFETY = 1.15;

/** 估算节点显示尺寸：text 可含 \n（正文并入） */
export function estimateSize(text) {
  const rows = String(text).split('\n');
  let w = MIN_W;
  for (const row of rows) {
    let rowW = 0;
    for (const ch of row) {
      const code = ch.codePointAt(0);
      // CJK 统一表意 / 兼容表意 / 全角 / 中文标点区段按全宽
      const isCjk =
        (code >= 0x2e80 && code <= 0x9fff) ||
        (code >= 0xf900 && code <= 0xfaff) ||
        (code >= 0xff00 && code <= 0xffef) ||
        (code >= 0x3000 && code <= 0x303f);
      rowW += isCjk ? CHAR_W.cjk : CHAR_W.ascii;
    }
    if (rowW > w) w = rowW;
  }
  return {
    w: Math.max(MIN_W, Math.ceil(w * SAFETY) + PAD),
    h: Math.ceil(rows.length * LINE_H * SAFETY + PAD),
  };
}

/**
 * 排版。返回 { nodes: [{text, w, h, x, y}], edges: [[pi, ci]] }
 * 坐标为矩形左上角（世界坐标，y 向下），整体平移到全正象限。
 * @param origin 整棵树的摆放原点（多块 dag 并排时每块各有 origin）
 */
export function layoutTree(forest, dir = 'lr', origin = { x: 100, y: 100 }) {
  // 多于 1 个顶级节点 → 合成 root 容器节点（与原版 MarkdownImporter 行为一致）
  const roots = forest.length === 1 ? forest : [{ title: 'root', lines: [], children: forest }];

  const nodes = [];
  const edges = [];
  const depthMaxMain = []; // 每深度层的最大主轴尺寸

  const isLr = dir === 'lr';
  const main = (s) => (isLr ? s.w : s.h);
  const cross = (s) => (isLr ? s.h : s.w);
  const gapMain = isLr ? GAP_MAIN : Math.round(GAP_MAIN * 0.6);

  // 先序建节点 + 后序定交叉轴。cursor = 本子树在交叉轴上的起点。返回 { span, index }。
  function place(node, depth, cursor) {
    const text = node.lines.length ? node.title + '\n' + node.lines.join('\n') : node.title;
    const size = estimateSize(text);
    const index = nodes.length;
    nodes.push({ text, w: size.w, h: size.h, x: 0, y: 0, depth });
    depthMaxMain[depth] = Math.max(depthMaxMain[depth] || 0, main(size));

    if (!node.children.length) {
      if (isLr) nodes[index].y = cursor;
      else nodes[index].x = cursor;
      return { span: cross(size), index };
    }

    let c = cursor;
    const childIdxs = [];
    for (const child of node.children) {
      const r = place(child, depth + 1, c);
      childIdxs.push(r.index);
      c += r.span + GAP_CROSS;
    }
    const childSpan = c - GAP_CROSS - cursor;

    // 子跨度区间（首尾子节点的交叉轴范围），父在跨度内居中
    const first = nodes[childIdxs[0]];
    const last = nodes[childIdxs[childIdxs.length - 1]];
    const spanStart = isLr ? first.y : first.x;
    const spanEnd = isLr ? last.y + last.h : last.x + last.w;
    const selfCross = (spanStart + spanEnd) / 2 - cross(size) / 2;
    if (isLr) nodes[index].y = selfCross;
    else nodes[index].x = selfCross;

    for (const ci of childIdxs) edges.push([index, ci]);
    return { span: Math.max(childSpan, cross(size)), index };
  }

  for (const root of roots) place(root, 0, 0);

  // 主轴：按深度分层。层内所有节点同一起点，层宽取该层最大尺寸。
  const depthOffset = []; // 每层的主轴起点
  let acc = 0;
  for (let d = 0; d < depthMaxMain.length; d++) {
    depthOffset[d] = acc;
    acc += (depthMaxMain[d] || 0) + gapMain;
  }
  for (const n of nodes) {
    const pos = depthOffset[n.depth] || 0;
    if (isLr) n.x = pos;
    else n.y = pos;
    delete n.depth;
  }

  // 整体平移到全正象限（留 100 边距）
  let minX = Infinity;
  let minY = Infinity;
  for (const n of nodes) {
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
  }
  const offX = origin.x - minX;
  const offY = origin.y - minY;
  for (const n of nodes) {
    n.x = Math.round(n.x + offX);
    n.y = Math.round(n.y + offY);
  }

  return { nodes, edges };
}
