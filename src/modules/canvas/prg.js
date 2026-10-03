// 树 → .prg 字节（zip + msgpack，格式权威定义在前端 Project.getFileContent /
// ProjectFile.parseProjectFile；实体 JSON 样板照 ProjectUpgrader.convertVAnyToN1）。
//
// 三条硬规则（见 PROGRESS.md 轮3 摸底与 serializer dist 实现）：
//   1. 跨对象引用写 {"$":"/<stage数组下标>"}（LineEdge.associationList 指向实体）
//   2. 值类键序敏感（无 passObject，构造参数按键序传入）：Vector 先 x 后 y、
//      Color 依次 r,g,b,a、Rectangle 先 location 后 size
//   3. metadata.version 写 LATEST_PROJECT_VERSION（"2.7.0"）→ 静默打开不弹升级框
import { encode } from '@msgpack/msgpack';
import { Uint8ArrayReader, Uint8ArrayWriter, ZipWriter } from '@zip.js/zip.js';
import { badInput } from '../../core/errors/index.js';

export const PRG_VERSION = '2.7.0';

// 连线端点比例哨兵（Edge.getExactEdgePositionByRate：0.01/0.99 = 边缘中点）
const RATES = {
  lr: { source: { x: 0.99, y: 0.5 }, target: { x: 0.01, y: 0.5 } }, // 父右 → 子左
  tb: { source: { x: 0.5, y: 0.99 }, target: { x: 0.5, y: 0.01 } }, // 父下 → 子上
};

function textNodeJson(uuid, text, x, y, w, h) {
  return {
    _: 'TextNode',
    uuid,
    text,
    details: [],
    collisionBox: {
      _: 'CollisionBox',
      shapes: [
        {
          _: 'Rectangle',
          location: { _: 'Vector', x, y }, // 左上角（键序：x, y）
          size: { _: 'Vector', x: w, y: h },
        },
      ],
    },
    color: { _: 'Color', r: 0, g: 0, b: 0, a: 0 }, // 透明 → 主题默认色
    fontScaleLevel: 0,
    sizeAdjust: 'auto', // 前端按文字实测重算框体
    fontFamily: '',
    fontWeight: '',
    borderStyle: 'solid',
  };
}

/**
 * 生成 .prg 字节。
 * @param nodes layoutTree 的输出节点 [{text, w, h, x, y}]
 * @param edges layoutTree 的输出边 [[父下标, 子下标]]
 * @param dir 'lr' | 'tb'（决定连线端点方向）
 */
export async function buildPrgBytes(nodes, edges, dir = 'lr') {
  if (!Array.isArray(nodes) || !nodes.length) throw badInput('节点为空');
  const rates = RATES[dir] || RATES.lr;

  const stage = [];
  nodes.forEach((n) => {
    stage.push(textNodeJson(crypto.randomUUID(), n.text, n.x, n.y, n.w, n.h));
  });
  for (const [p, c] of edges) {
    if (!(p >= 0 && p < nodes.length && c >= 0 && c < nodes.length)) {
      throw badInput(`边越界: ${p} -> ${c}`);
    }
    stage.push({
      _: 'LineEdge',
      uuid: crypto.randomUUID(),
      // 节点先序 push、实体随后追加 → 实体下标恰等于节点下标
      associationList: [{ $: `/${p}` }, { $: `/${c}` }],
      text: '',
      color: { _: 'Color', r: 0, g: 0, b: 0, a: 0 },
      sourceRectangleRate: { _: 'Vector', x: rates.source.x, y: rates.source.y },
      targetRectangleRate: { _: 'Vector', x: rates.target.x, y: rates.target.y },
      lineType: 'solid',
      arrowType: 'default',
    });
  }

  const u8 = (obj) => new Uint8ArrayReader(encode(obj));
  // getData 在目的地 writer 上（同 FileSystemProviderDraft 的用法），不在 ZipWriter 上
  const destination = new Uint8ArrayWriter();
  const writer = new ZipWriter(destination);
  // 键序即条目写入序，与前端 parseProjectFile 的嗅探无关，但保持同序便于排查
  writer.add('stage.msgpack', u8(stage), { level: 0 });
  writer.add('tags.msgpack', u8([]), { level: 0 });
  writer.add('reference.msgpack', u8({ sections: {}, files: [] }), { level: 0 });
  writer.add('metadata.msgpack', u8({ version: PRG_VERSION }), { level: 0 });
  await writer.close();
  return await destination.getData();
}
