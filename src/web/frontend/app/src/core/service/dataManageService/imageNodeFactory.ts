// nx-pg 重建：原版用 plate 富文本做节点详情区，nx-pg 删了 plate 后这里一度变成「只 new 不入台」的占位实现
// —— 粘贴图片时节点根本没进 project.stage，画布上什么都不会出现，且尺寸恒为 100×100。
// 现按原版语义重建核心部分（附件 + 入台 + 真实尺寸），细节富文本区仍留空。
import { ImageNode } from "@/core/stage/stageObject/entity/ImageNode";
import { Section } from "@/core/stage/stageObject/entity/Section";
import { CollisionBox } from "@/core/stage/stageObject/collisionBox/collisionBox";
import type { Project } from "@/core/Project";
import { Settings } from "@/core/service/Settings";
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

export async function createImageNodeFromBlob(
  project: Project,
  blob: Blob,
  options: CreateImageNodeFromBlobOptions,
): Promise<ImageNode> {
  // 没给尺寸就真去量图片本身。少了这一步所有图都是 100×100，
  // 大图被压扁、小图被拉伸 —— 粘贴出来的节点尺寸和图片内容对不上。
  let width = options.intrinsicSize?.width;
  let height = options.intrinsicSize?.height;
  if (!width || !height) {
    const bitmap = await createImageBitmap(blob);
    width = bitmap.width;
    height = bitmap.height;
    bitmap.close();
  }
  const maxDisplaySize = options.maxDisplaySize ?? Number.POSITIVE_INFINITY;
  const displaySize = calculateImageDisplaySize(width, height, maxDisplaySize);
  const scale = displaySize.width / width;

  // 必须走 addAttachment 而不是 URL.createObjectURL：
  // ImageNode 构造时按 attachmentId 去 project.attachments 里取 blob（ImageNode.tsx:96），
  // 取不到就直接把 state 置为 "notFound"，节点会渲染成一张破图。
  // 顺带的好处：图片进 attachments，存 .prg 时会被一并打包（Project.tsx:392）。
  const attachmentId = project.addAttachment(blob);
  const location = options.location.clone();

  const imageNode = new ImageNode(
    project,
    {
      attachmentId,
      collisionBox: new CollisionBox([new Rectangle(location, new Vector(width * scale, height * scale))]),
      details: (options.details ?? []) as never,
      scale,
    },
    false,
    // nx-pg：与原版一致（project-graph imageNodeFactory.ts:55）——调用方没显式指定时
    // 回退到 Settings.wrapImageInGroup，即 Agent.md 第 10 条要求的
    // 「复制照片之后自动完成 Ctrl+G 的打框操作」。
    (options.wrapInSection ?? Settings.wrapImageInGroup)
      ? () => {
          const section = Section.fromEntities(project, [imageNode]);
          section.text = "";
          project.stageManager.add(section);
        }
      : undefined,
  );

  // 关键：原版这行是 stageManager.add，stub 里漏了 —— 节点建出来但不在 stage 里，
  // 于是渲染器遍历不到、状态栏节点数也不涨，表现为「粘贴没反应」。
  project.stageManager.add(imageNode);
  return imageNode;
}
