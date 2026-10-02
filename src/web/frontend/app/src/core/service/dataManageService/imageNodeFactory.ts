// nx-pg stub: 原 imageNodeFactory 用 plate 富文本做节点详情区。
// nx-pg 删了 plate 后，createImageNodeFromBlob 返回最薄的占位实现（不做真正的创建）。
import { ImageNode } from "@/core/stage/stageObject/entity/ImageNode";
import { Section } from "@/core/stage/stageObject/entity/Section";
import { CollisionBox } from "@/core/stage/stageObject/collisionBox/collisionBox";
import { Rectangle } from "@graphif/shapes";
import { Vector } from "@graphif/data-structures";

export type CreateImageNodeFromBlobOptions = {
  location: Vector;
  intrinsicSize?: { width: number; height: number };
  maxDisplaySize?: number;
  details?: unknown;
  wrapInSection?: boolean;
};

export function calculateImageDisplaySize(width: number, height: number, maxDisplaySize: number) {
  const ratio = width / height || 1;
  if (width > maxDisplaySize) {
    return { width: maxDisplaySize, height: maxDisplaySize / ratio };
  }
  return { width, height };
}

export function createImageNodeFromBlob(
  project: unknown,
  blob: Blob,
  options: CreateImageNodeFromBlobOptions,
): ImageNode {
  const w = options.intrinsicSize?.width ?? 100;
  const h = options.intrinsicSize?.height ?? 100;
  const node = new ImageNode(project as never, {
    url: URL.createObjectURL(blob),
    collisionBox: new CollisionBox([new Rectangle(options.location, new Vector(w, h))]),
  });
  if (options.wrapInSection) {
    new Section(project as never, {
      collisionBox: new CollisionBox([new Rectangle(options.location, new Vector(w + 32, h + 32))]),
      children: [node],
    });
  }
  return node;
}
