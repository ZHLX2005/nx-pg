import { Vector } from "@graphif/data-structures";
import { cn } from "@udecode/cn";
import { useAtomValue } from "jotai";
import {  CircleAlert, CloudUpload, X } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { URI } from "vscode-uri";
import TabContextMenu from "./components/tab-context-menu";
import { Button } from "./components/ui/button";
import { Dialog } from "./components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";
import { Project, ProjectState } from "./core/Project";
import { RecentFileManager } from "./core/service/dataFileService/RecentFileManager";
import { SoundService } from "./core/service/feedbackService/SoundService";
import { Settings } from "./core/service/Settings";
import { ComponentTab, Tab } from "./core/Tab";
import { TabWorkspace } from "./core/TabWorkspace";
import { activeResourceTabAtom, store, tabsAtom } from "./state";
import { rename } from "@tauri-apps/plugin-fs";
import { exists } from "@tauri-apps/plugin-fs";
import { replaceTextWhenProtect } from "./utils/font";
import { PathString } from "./utils/pathString";

/**
 * 双击 tab 重命名（nx-pg 特化：原版无此交互）。
 * 仅 file 方案的工程可改名：磁盘 rename → 更新工程 uri → 同步 recent 列表。
 * draft 走保存流程起名，collab 不是本地文件，均排除。
 */
async function renameProjectByDialog(project: Project) {
  if (project.uri.scheme !== "file") {
    if (project.isDraft) {
      toast.info("临时草稿没有文件名，请用 Ctrl+S 保存时起名");
    }
    return;
  }
  const oldFsPath = project.uri.fsPath;
  const oldName = PathString.getFileNameFromPath(oldFsPath) + ".prg";
  const input = await Dialog.input("重命名文件", "输入新的文件名（保留 .prg 扩展名）", {
    defaultValue: oldName,
  });
  if (input === undefined) return; // 取消
  let newName = input.trim();
  if (!newName) return;
  if (!newName.toLowerCase().endsWith(".prg")) newName += ".prg";
  if (newName === oldName) return;
  if (/[\\/:*?"<>|]/.test(newName)) {
    toast.error("文件名不能包含 \\ / : * ? \" < > |");
    return;
  }

  const sep = oldFsPath.includes("\\") ? "\\" : "/";
  const dir = PathString.dirPath(oldFsPath);
  const newFsPath = dir + sep + newName;
  try {
    if (await exists(newFsPath)) {
      toast.error(`重命名失败：${newName} 已存在`);
      return;
    }
    await rename(oldFsPath, newFsPath);
  } catch (e) {
    toast.error(`重命名失败：${e}`);
    return;
  }

  // 同步所有打开着这个文件的 tab（uri 匹配）
  const newUri = URI.file(newFsPath);
  const opened = store.get(tabsAtom).filter((tab) => tab instanceof Project && tab.uri.toString() === project.uri.toString());
  for (const tab of opened) {
    if (tab instanceof Project) tab.uri = newUri;
  }
  // recent 列表：旧记录删除、新记录置顶
  await RecentFileManager.removeRecentFileByUri(URI.file(oldFsPath));
  await RecentFileManager.addRecentFileByUri(newUri);
  toast.success(`已重命名：${oldName} → ${newName}`);
}

// 将 ProjectTabs 移出 App 组件，作为独立组件
export const ProjectTabs = memo(function ProjectTabs({
  groupId,
  tabs,
  activeTab,
  onTabClick,
  onTabClose,
  isClassroomMode,
}: {
  groupId: string;
  tabs: Tab[];
  activeTab: Tab | undefined;
  onTabClick: (tab: Tab) => void;
  onTabClose: (tab: Tab) => void;
  isClassroomMode: boolean;
}) {
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const scrollPositionRef = useRef(0);
  const [protectingPrivacy, setProtectingPrivacy] = useState(Settings.protectingPrivacy);
  const activeResourceTab = useAtomValue(activeResourceTabAtom);

  useEffect(() => {
    const unwatch = Settings.watch("protectingPrivacy", setProtectingPrivacy);
    return unwatch;
  }, []);

  // 保存滚动位置
  const saveScrollPosition = useCallback(() => {
    if (tabsContainerRef.current) {
      scrollPositionRef.current = tabsContainerRef.current.scrollLeft;
    }
  }, []);

  // 恢复滚动位置
  const restoreScrollPosition = useCallback(() => {
    if (tabsContainerRef.current) {
      tabsContainerRef.current.scrollLeft = scrollPositionRef.current;
    }
  }, []);

  // 处理标签点击
  const handleTabClick = useCallback(
    (tab: Tab) => {
      saveScrollPosition();
      onTabClick(tab);
      // 微任务中恢复滚动位置
      Promise.resolve().then(restoreScrollPosition);
    },
    [onTabClick, saveScrollPosition, restoreScrollPosition],
  );

  // 处理标签关闭
  const handleTabClose = useCallback(
    async (tab: Tab, e: React.MouseEvent) => {
      e.stopPropagation();
      saveScrollPosition();
      await onTabClose(tab);
      Promise.resolve().then(restoreScrollPosition);
    },
    [onTabClose, saveScrollPosition, restoreScrollPosition],
  );

  // 监听滚动
  const handleScroll = useCallback(() => {
    saveScrollPosition();
  }, [saveScrollPosition]);

  return (
    <div
      ref={tabsContainerRef}
      data-pg-tab-bar
      data-pg-tab-group-bar-id={groupId}
      className={cn(
        "scrollbar-hide hover:bg-primary/20 z-10 flex h-4 overflow-x-auto whitespace-nowrap transition-colors hover:opacity-100 sm:h-6 sm:gap-1",
        isClassroomMode && "opacity-0",
      )}
      onScroll={handleScroll}
    >
      {tabs.map((tab) => (
        <TabContextMenu key={tab.id} tab={tab} onClose={onTabClose}>
          <Button
            data-pg-docked-tab-id={tab.id}
            className={cn(
              "hover:bg-primary/20 outline-inset text-foreground h-full cursor-pointer rounded-none px-2 hover:opacity-100 sm:rounded-sm",
              activeTab === tab ? "bg-primary text-primary-foreground" : "bg-card text-card-foreground opacity-70",
              tab instanceof Project && tab.isSaving && "animate-pulse",
            )}
            onMouseDown={(e) => {
              if (e.button === 0) {
                SoundService.play.mouseClickButton();
                handleTabClick(tab);
                const start = new Vector(e.clientX, e.clientY);
                let dragged = false;
                const onMouseUp = (event: MouseEvent) => {
                  window.removeEventListener("mousemove", onMouseMove);
                  window.removeEventListener("mouseup", onMouseUp);
                  const target = TabWorkspace.getDropTarget(event.clientX, event.clientY);
                  TabWorkspace.clearDropPreview();
                  if (!dragged) return;
                  if (target) {
                    TabWorkspace.moveTab(tab.id, target);
                  } else {
                    TabWorkspace.float(tab.id, new Vector(event.clientX - 80, event.clientY - 12));
                  }
                };
                const onMouseMove = (event: MouseEvent) => {
                  if (new Vector(event.clientX, event.clientY).subtract(start).magnitude() < 8) return;
                  dragged = true;
                  TabWorkspace.previewDrop(event.clientX, event.clientY);
                };
                window.addEventListener("mousemove", onMouseMove);
                window.addEventListener("mouseup", onMouseUp);
              } else if (e.button === 1) {
                e.preventDefault();
                saveScrollPosition();
                onTabClose(tab);
                Promise.resolve().then(restoreScrollPosition);
                SoundService.play.cuttingLineRelease();
              }
            }}
            onMouseEnter={() => {
              SoundService.play.mouseEnterButton();
            }}
          >
            <span
              className="flex items-center gap-1 text-xs"
              onDoubleClick={(e) => {
                if (tab instanceof Project && tab.uri.scheme === "file") {
                  e.stopPropagation();
                  void renameProjectByDialog(tab);
                }
              }}
            >
              {tab.icon && <tab.icon className="size-3" />}
              {(() => {
                const name = tab.title;
                return protectingPrivacy ? replaceTextWhenProtect(name ?? "") : name;
              })()}
              {tab instanceof ComponentTab && tab.contextTarget === "activeResourceTab" && (
                <span className="max-w-32 truncate opacity-70">→ {activeResourceTab?.title ?? "无项目"}</span>
              )}
            </span>
            <div
              className="flex size-4 cursor-pointer items-center justify-center hover:opacity-100"
              onClick={(e) => {
                if (tab instanceof Project && tab.isSaving) {
                  // 如果正在保存中，显示提示
                  toast.warning("正在保存中，请勿擅自做多余的操作");
                  SoundService.play.cuttingLineRelease();
                } else if (tab instanceof Project && tab.projectState === ProjectState.Unsaved) {
                  // 如果是未保存状态，根据项目类型执行不同操作
                  if (tab.uri.scheme === "draft") {
                    // 草稿文件，弹出对话框
                    handleTabClose(tab, e);
                    SoundService.play.cuttingLineRelease();
                  } else {
                    // 已有的文件，直接保存
                    tab.save();
                    SoundService.play.cuttingLineRelease();
                  }
                } else {
                  // 其他状态，执行关闭操作
                  handleTabClose(tab, e);
                  SoundService.play.cuttingLineRelease();
                }
              }}
            >
              {tab instanceof Project && tab.isSaving ? (
                <span className="grid size-3.5 animate-spin grid-cols-2">
                  <span className="border-accent-foreground w-full animate-pulse rounded-full border-1 p-0.5"></span>
                  <span className="border-accent-foreground w-full rounded-full border-1 p-0.5"></span>
                  <span className="border-accent-foreground w-full rounded-full border-1 p-0.5"></span>
                  <span className="border-accent-foreground w-full animate-pulse rounded-full border-1 p-0.5"></span>
                </span>
              ) : tab instanceof Project && tab.projectState === ProjectState.Saved ? (
                <X className="scale-75 opacity-75" />
              ) : tab instanceof Project && tab.projectState === ProjectState.Stashed ? (
                <CloudUpload />
              ) : tab instanceof Project ? (
                <Tooltip>
                  {/* 醒目提醒用户，崩溃了丢了文件别怪开发者提醒不到位 */}
                  <TooltipTrigger>
                    <CircleAlert className="*:text-destructive! text-destructive!" />
                  </TooltipTrigger>
                  <TooltipContent>未保存！</TooltipContent>
                </Tooltip>
              ) : (
                <X className="scale-75 opacity-75" />
              )}
            </div>
          </Button>
        </TabContextMenu>
      ))}
    </div>
  );
});
