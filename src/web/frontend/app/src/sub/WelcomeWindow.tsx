import { Project } from "@/core/Project";
import { RecentFileManager } from "@/core/service/dataFileService/RecentFileManager";
import { closeEmptyDrafts, onNewDraft, onOpenFile } from "@/core/service/GlobalMenu";
import { createSubWindow } from "@/core/subWindowOpen";
import { TabWorkspace } from "@/core/TabWorkspace";
import { store, tabsAtom } from "@/state";
import RecentFilesWindow from "@/sub/RecentFilesWindow";
import SettingsWindow from "@/sub/SettingsWindow";
import { cn } from "@/utils/cn";
import { Path } from "@/utils/path";
import { isMac } from "@/utils/platform";
import { Vector } from "@graphif/data-structures";
import { Rectangle } from "@graphif/shapes";
import { getVersion } from "@tauri-apps/api/app";
import {
    FilePlus,
    FolderOpen,
    LoaderCircle,
    RefreshCw,
    Settings as SettingsIcon,
    TableProperties,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { URI } from "vscode-uri";

const welcomeTabIds = new Set<string>();

// nx-pg：slogans 清自原版（project-graph WelcomeWindow.tsx），删掉桌面专属条目
// （exe/zip 防限制、窗口小黄点、透明窗口、窗口拖拽带、跨文件双开等 web 化不适用的技巧）。
const slogans = [
  "思维框架图和思维导图的区别在于，思维框架图不局限于树形结构，可以自由连接节点，形成用于分析项目结构的网络结构",
  "目前一般不建议一个prg文件超过50MB，否则文件过大可能影响性能，保存缓慢",
  "格式化树形结构时，需要保证每个连线都是一种标准化的方向的连线，例如向右的连线从源头右侧发出，目标左侧接收",
  "alt shift f 可以格式化树形结构，它源自于 VS Code 格式化代码的快捷键。每当按下这个快捷键时，左手像个兰花指。",
  "这个软件不是传统的思维导图软件",
  "WSAD可以移动视野。但其他软件的全局快捷键可能会干扰此软件监听WSAD的松开事件，进而导致视野一直朝着某方向移动，可以手动触发一次松开解决",
  "当视野放大到极限时会回到宏观视角。源自《围观尽头》",
  "F键可以快速聚焦视野到选中的物体，再按下shift+F可以快速回到按下F键之前的宏观视角",
  "选中图片后右下角有一个绿色按钮，可以拖拽改变大小",
  "向左框选和向右框选逻辑不同，源自CAD，框选可以大幅度提升自由布局的移动效率",
  "prg文件是软件的专有格式，用于存储思维框架图数据。本质是一个zip压缩包，解压后可以看到里面的图片文件",
  "当一个文本节点的内容恰好为一个文件的绝对路径或者网页URL时，可以 中键双击/快捷键/右键 直接打开这个文件或者网页",
  "按住ctrl键框选，可以实现反选。进而可以实现先选中一些节点，再用反选框选一次，选中所有的连线。",
  "框选优先级：框选起点所在分组框 > 节点 > 连线",
  "文本节点的字体大小是指数级别的，因为缩放视野时鼠标滚动的圈数和视野内大小变化尺度也是指数级别的。",
  "WSAD移动时，如果是高空飞行，移动速度会很快，如果是低空飞行，移动速度会很慢。",
  "选中两个节点，按两次数字4，可以左对齐，6是右对齐，8、2是上下对齐，看九宫格小键盘非常直观",
  "当脑机接口与视网膜投屏实现的那一天出现时，这个软件的生命就终结了，获许会以一种新的形态出现",
  "小特性：鼠标在空白地方拖出一个框选框不松手时，按下ctrl+G会直接创建一个框选框大小的分组框。用于自顶向下的绘制大板块结构",
  "不要当一个囤积知识的笔记拷贝者，而是要当一个知识的创造者与思考者。",
  "推荐使用新版的导出PNG图片功能而非旧版的拼接图片导出功能",
  "复制截图后直接 Ctrl+V 就能贴到画布上；设置里开启「粘贴图片后自动打框」可以自动包一个分组框。",
];

function isWelcomeTab(tab: { id: string }): boolean {
  return welcomeTabIds.has(tab.id);
}

export default function WelcomeWindow({ tabId }: { tabId: string }) {
  const [recentFiles, setRecentFiles] = useState<RecentFileManager.RecentFile[]>([]);
  const { t } = useTranslation("welcome");
  const [appVersion, setAppVersion] = useState("unknown");
  const [isLoading, setIsLoading] = useState(false);
  const [lastClickFileURIPath, setLastClickFileURIPath] = useState("");
  const [currentSlogan, setCurrentSlogan] = useState("");
  const [isHoveringSlogan, setIsHoveringSlogan] = useState(false);

  useEffect(() => {
    refresh();
    (async () => {
      setAppVersion(await getVersion());
    })();

    randomizeSlogan();

    return () => {
      // 点击外部 / Escape 等路径关闭时也要清掉标记，避免下次 open 误判
      welcomeTabIds.delete(tabId);
    };
  }, [tabId]);

  const randomizeSlogan = () => {
    const randomIndex = Math.floor(Math.random() * slogans.length);
    setCurrentSlogan(slogans[randomIndex]);
  };

  async function refresh() {
    setIsLoading(true);
    await RecentFileManager.sortTimeRecentFiles();
    setRecentFiles(await RecentFileManager.getRecentFiles());
    setIsLoading(false);
  }

  async function closeSelf() {
    await TabWorkspace.close(tabId);
    welcomeTabIds.delete(tabId);
  }

  async function openProject(uri: URI | undefined, source: string) {
    // 先关欢迎窗，避免系统文件对话框触发 closeWhenClickOutside 的竞态
    await closeSelf();
    const opened = await onOpenFile(uri, source);
    if (opened instanceof Project) {
      await closeEmptyDrafts(opened);
    } else if (opened) {
      await closeEmptyDrafts();
    }
  }

  async function handleNewDraft() {
    await closeSelf();
    const hasEmptyDraft = store
      .get(tabsAtom)
      .some((tab) => tab instanceof Project && tab.isDraft && tab.stage.length === 0 && !tab.closing);
    if (!hasEmptyDraft) {
      await onNewDraft();
    }
  }

  return (
    <div className="flex h-full w-full overflow-auto p-4">
      <div className="m-auto flex w-full max-w-3xl flex-col gap-6 sm:gap-8">
        <div className="flex flex-col sm:gap-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl sm:text-3xl">{t("title")}</span>
            {/* nx-pg：版本号保留但去掉链接（原指向 graphif.dev 官网历史页） */}
            <span className="border-card-foreground/30 hidden border-2 opacity-50 sm:inline sm:rounded-lg sm:px-2 sm:py-1 md:text-lg">
              {appVersion}
            </span>
          </div>
          <div
            className="relative hidden text-xs opacity-50 sm:block"
            onMouseEnter={() => setIsHoveringSlogan(true)}
            onMouseLeave={() => setIsHoveringSlogan(false)}
          >
            <span>{currentSlogan}</span>
            {isHoveringSlogan && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  randomizeSlogan();
                }}
                className="hover:bg-muted absolute top-0 right-0 ml-2 inline-flex cursor-pointer items-center justify-center rounded p-1 transition-all active:scale-90"
                title="换一条小技巧"
              >
                <RefreshCw size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-8 sm:flex-row sm:gap-12">
          <div className="flex min-w-0 flex-1 flex-col gap-6 sm:gap-8">
            <div className="grid grid-cols-2 grid-rows-2 gap-2 *:flex *:w-max *:cursor-pointer *:items-center *:gap-2 *:hover:opacity-75 *:active:scale-90 sm:gap-x-4">
              {/* nx-pg：原左上的「功能说明书」下载入口已删——依赖 GitHub 拉取教程 prg，
                  个人 web 版无此依赖；快捷键文档见设置或 CommandPalette */}
              <div onClick={() => void handleNewDraft()}>
                <FilePlus />
                <span className="hidden sm:inline">{t("newDraft")}</span>
                <span className="hidden text-xs opacity-50 sm:inline">{isMac ? "⌘ + N" : "Ctrl + N"}</span>
              </div>
              <div
                onClick={() => {
                  void closeSelf();
                  RecentFilesWindow.open();
                }}
              >
                <TableProperties />
                <span className="hidden sm:inline">{t("openRecentFiles")}</span>
                <span className="hidden text-xs opacity-50 sm:inline">Shift + #</span>
              </div>
              <div onClick={() => void openProject(undefined, "欢迎页面")}>
                <FolderOpen />
                <span className="hidden sm:inline">{t("openFile")}</span>
                <span className="hidden text-xs opacity-50 sm:inline">{isMac ? "⌘ + O" : "Ctrl + O"}</span>
              </div>
            </div>
            <div
              className={cn("hidden flex-col gap-2 *:cursor-pointer *:transition-opacity *:hover:opacity-75 sm:flex")}
            >
              {recentFiles.slice(0, 6).map((file, index) => (
                <div
                  className="flex flex-row items-center gap-2"
                  key={index}
                  onClick={async () => {
                    if (isLoading) {
                      toast.error("正在打开文件，请稍后");
                      return;
                    }
                    setIsLoading(true);
                    setLastClickFileURIPath(file.uri.fsPath);
                    try {
                      await openProject(file.uri, "欢迎页面-最近打开的文件");
                    } catch (e) {
                      toast.error(e as string);
                    }
                    setIsLoading(false);
                    setLastClickFileURIPath("");
                  }}
                >
                  {isLoading && lastClickFileURIPath === file.uri.fsPath && (
                    <LoaderCircle className={cn(isLoading && "animate-spin")} />
                  )}
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="text-sm">{new Path(file.uri).nameWithoutExt}</span>
                    <span className="truncate text-xs opacity-50">{file.uri.fsPath}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2 *:flex *:w-max *:cursor-pointer *:gap-2 *:hover:opacity-75 *:active:scale-90">
            <div
              onClick={() => {
                void closeSelf();
                SettingsWindow.open("settings");
              }}
            >
              <SettingsIcon />
              <span className="hidden sm:inline">{t("settings")}</span>
            </div>
            {/* nx-pg：「关于」与原项目官网入口已删（Agent.md 排除项 7/8） */}
          </div>
        </div>
      </div>
    </div>
  );
}

WelcomeWindow.open = () => {
  const existing = store.get(tabsAtom).find((tab) => !tab.closing && isWelcomeTab(tab));
  if (existing) {
    TabWorkspace.focus(existing.id);
    return existing;
  }

  const tab = createSubWindow("WelcomeWindow", {
    children: (componentTab) => <WelcomeWindow tabId={componentTab.id} />,
    rect: Rectangle.inCenter(new Vector(Math.min(960, innerWidth * 0.85), Math.min(640, innerHeight * 0.8))),
    canDock: false,
    closable: false,
    titleBarOverlay: true,
    closeWhenClickOutside: true,
  });
  welcomeTabIds.add(tab.id);
  return tab;
};

WelcomeWindow.closeAll = async () => {
  const welcomeTabs = store.get(tabsAtom).filter((tab) => !tab.closing && isWelcomeTab(tab));
  await Promise.all(
    welcomeTabs.map(async (tab) => {
      await TabWorkspace.close(tab.id);
      welcomeTabIds.delete(tab.id);
    }),
  );
};
