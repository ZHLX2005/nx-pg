// nx-pg stub：原 DetailsManager 依赖 plate 富文本引擎做节点详情编辑。
// nx-pg 删了 plate UI 后，这里只保留接口壳——方法签名与原类对齐，但内部实现用 markdown 字符串替代 plate Value。
import { Vector } from "@graphif/data-structures";

export type DetailsItem = { type: string; children?: DetailsItem[]; [k: string]: unknown };

export class DetailsManager {
  // 原类构造签名：constructor(private entity: Entity)
  // 这里 entity 占位类型用 unknown，由调用方按需转
  constructor(_entity: unknown) {}

  public isEmpty(): boolean {
    return true;
  }

  public markdownToDetails(_md: string): DetailsItem[] {
    return [];
  }

  public detailsToMarkdown(_details: DetailsItem[]): string {
    return "";
  }

  // 兼容旧版本 API：getText / getDescription
  public getText(): string {
    return "";
  }

  public getDescription(): Vector | null {
    return null;
  }

  public toJSON(): unknown {
    return [];
  }
}
