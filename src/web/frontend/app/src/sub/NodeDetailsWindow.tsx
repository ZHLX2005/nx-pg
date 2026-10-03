// nx-pg：节点详情 textarea 编辑窗（替代原 plate 富文本编辑）。
// 数据通路：details → detailsToMarkdown → textarea → markdownToDetails → 写回 entity.details。
// 不依赖 plate 引擎，纯文本；详情渲染层（entityDetailsManager）已 stub 兼容。
import { Button } from "@/components/ui/button";
import { Project } from "@/core/Project";
import { DetailsManager } from "@/core/stage/stageObject/tools/entityDetailsManager";
import { createSubWindow } from "@/core/subWindowOpen";
import { useEffect, useState } from "react";
import { toast } from "sonner";

/**
 * 打开节点详情编辑窗
 * @param value 当前 details（plate Value 形状，纯数据）
 * @param callback 用户保存后回调（value 是新 details，原数据形状）
 * @param project 所属 Project（用于 historyManager 记录撤销）
 */
function NodeDetailsEditor({
  initialDetails,
  onSave,
  project,
}: {
  initialDetails: unknown;
  onSave: (newDetails: unknown) => void;
  project: Project;
}) {
  const initialText = DetailsManager.detailsToMarkdown((initialDetails ?? []) as never);
  const [text, setText] = useState(initialText);
  // 占位：编辑器挂载时记录一次撤销点，保存后再记录一次（让 Ctrl+Z 撤销整次编辑）
  useEffect(() => {
    project?.historyManager?.recordStep();
  }, []);

  const handleSave = () => {
    const newDetails = DetailsManager.prototype.markdownToDetails.call(
      { entity: { details: [] } },
      text,
    );
    onSave(newDetails);
    project?.historyManager?.recordStep();
    toast.success("详情已保存");
    NodeDetailsWindow.close();
  };

  const handleCancel = () => {
    NodeDetailsWindow.close();
  };

  return (
    <div className="text-foreground flex h-full flex-col gap-3 p-4 text-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">编辑节点详情</h2>
        <div className="text-muted-foreground text-xs">{entity?.constructor?.name ?? "节点"}</div>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            handleSave();
          } else if (e.key === "Escape") {
            e.preventDefault();
            handleCancel();
          }
        }}
        placeholder="纯文本详情（不支持富文本，存为单段落或多段落）"
        className="bg-card text-card-foreground min-h-0 flex-1 resize-none rounded border p-2 font-mono text-xs"
        autoFocus
      />
      <div className="flex gap-2">
        <Button onClick={handleSave}>保存（Ctrl+Enter）</Button>
        <Button variant="ghost" onClick={handleCancel}>
          取消
        </Button>
        <div className="text-muted-foreground ml-auto self-center text-xs">
          提示：Ctrl+Enter 保存，Esc 取消
        </div>
      </div>
    </div>
  );
}

/** 关闭最近打开的详情编辑窗（用于关闭逻辑 + Editor 内部取消/保存） */
let _lastEditorTab: { id: string } | undefined;
const NodeDetailsWindow = {
  open(value: unknown, callback: (v: unknown) => void, project: Project): void {
    if (!project) {
      toast.error("节点详情编辑：缺少项目引用，请通过 Ctrl+点击节点或选中节点后按 Ctrl+E 触发");
      return;
    }
    const tab = createSubWindow("NodeDetailsWindow", {
      title: "节点详情",
      contextTarget: "activeResourceTab",
      children: () => (
        <NodeDetailsEditor
          initialDetails={value}
          onSave={callback}
          project={project}
        />
      ),
      rect: { location: { x: 120, y: 120 }, size: { x: 520, y: 480 } } as any,
    });
    _lastEditorTab = tab;
  },
  close(): void {
    if (_lastEditorTab?.id) {
      import("@/core/TabWorkspace").then(({ TabWorkspace }) => TabWorkspace.close(_lastEditorTab!.id));
      _lastEditorTab = undefined;
    }
  },
  closeAll(): void {
    NodeDetailsWindow.close();
  },
};
export default NodeDetailsWindow;
