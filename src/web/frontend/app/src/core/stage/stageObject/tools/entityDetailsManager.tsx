// nx-pg stub：原 DetailsManager 依赖 plate 富文本引擎做节点详情编辑与渲染。
// nx-pg 删了 plate UI 后，这里保留原类公开接口——details 数据结构不变（plate Value 形状的
// 纯数据，序列化兼容 .prg），渲染/导出时按数据形状递归抽取纯文本；编辑 UI 后续按需补。
import { Vector } from "@graphif/data-structures";

export type DetailsItem = { type: string; children?: DetailsItem[]; text?: string; [k: string]: unknown };

/** 从 plate Value 形状的纯数据里递归抽文本（无 plate 引擎依赖） */
function detailsToPlainText(details: unknown): string {
  if (typeof details === "string") return details;
  if (!Array.isArray(details)) return "";
  const lines: string[] = [];
  for (const block of details as DetailsItem[]) {
    if (!block || typeof block !== "object") continue;
    // 代码块等特殊块型保留前缀标识
    const prefix = block.type === "code_block" ? "" : block.type === "h1" ? "# " : "";
    const text = collectChildrenText(block);
    lines.push(prefix + text);
  }
  return lines.join("\n");
}

function collectChildrenText(node: DetailsItem): string {
  if (typeof node.text === "string") return node.text;
  if (!Array.isArray(node.children)) return "";
  return node.children.map((c) => collectChildrenText(c as DetailsItem)).join("");
}

export class DetailsManager {
  private readonly entity: { details: DetailsItem[] };
  /** 渲染缓存：details 引用 → markdown（原版同款机制，避免每帧重算） */
  private cacheMap = new WeakMap<object, string>();

  constructor(entity: { details: DetailsItem[] }) {
    this.entity = entity;
  }

  public isEmpty(): boolean {
    const d = this.entity?.details;
    if (!Array.isArray(d) || d.length === 0) return true;
    // 只有一个空段落也算空
    if (d.length === 1) {
      const text = collectChildrenText(d[0]).trim();
      return text === "";
    }
    return false;
  }

  /** 舞台渲染 / 导出 / 搜索用的 markdown 文本（带缓存） */
  public getRenderStageString(): string {
    if (this.isEmpty()) return "";
    const key = this.entity.details as unknown as object;
    if (this.cacheMap.has(key)) return this.cacheMap.get(key)!;
    const md = detailsToPlainText(this.entity.details).replace("\n\n", "\n");
    this.cacheMap.set(key, md);
    return md;
  }

  /** 原类静态方法：plate Value → markdown（纯文本级实现） */
  public static detailsToMarkdown(details: DetailsItem[]): string {
    return detailsToPlainText(details);
  }

  /** 原类实例方法：markdown → plate Value（单段落纯文本块） */
  public markdownToDetails(md: string): DetailsItem[] {
    if (!md?.trim()) return [];
    return md.split("\n").map((line) => ({
      type: "p",
      children: [{ text: line }],
    }));
  }

  public getText(): string {
    return this.getRenderStageString();
  }

  public getDescription(): Vector | null {
    return null;
  }

  public toJSON(): unknown {
    return this.entity?.details ?? [];
  }
}
