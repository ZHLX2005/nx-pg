// 工作目录文件浏览器（nx-pg 特化：原版是桌面应用，文件选择走系统对话框；
// web 版的 workspace 在 server 端，必须自建列表 UI 才能直观选择文件）。
//
// 数据源：GET /api/project/fs/readdir（含 mtimeMs）+ /api/project/workspace。
// 交互：目录树逐层展开（懒加载）；双击 .prg 打开；条目按钮 = 打开 / 重命名 / 删除；
//       顶部 = workspace 路径 + 刷新 + 新建文件夹 + 新建文件名输入。
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { onOpenFile } from "@/core/service/GlobalMenu";
import { createSubWindow } from "@/core/subWindowOpen";
import { TabWorkspace } from "@/core/TabWorkspace";
import { cn } from "@/utils/cn";
import { exists, mkdir, readDir, remove, rename, writeFile } from "@tauri-apps/plugin-fs";
import {
  ChevronDown,
  ChevronRight,
  File as FileIcon,
  FilePlus,
  FolderOpen,
  FolderPlus,
  Pencil,
  RefreshCcw,
  Trash2,
} from "lucide-react";
import React from "react";
import { toast } from "sonner";
import { URI } from "vscode-uri";

type Entry = {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
  mtimeMs: number;
};

/** workspace 绝对路径 → URI.file（vscode-uri 会归一盘符大小写，与 RecentFileManager 一致） */
function pathToUri(ws: string, absPath: string) {
  return URI.file(absPath);
}

function joinPath(dir: string, name: string): string {
  const sep = dir.includes("\\") ? "\\" : "/";
  return dir.endsWith(sep) ? dir + name : dir + sep + name;
}

function formatTime(mtimeMs: number): string {
  if (!mtimeMs) return "";
  const d = new Date(mtimeMs);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function WorkspaceFilesWindow({ tabId }: { tabId: string }) {
  const [workspace, setWorkspace] = React.useState("");
  const [rootEntries, setRootEntries] = React.useState<Entry[] | null>(null);
  const [expanded, setExpanded] = React.useState<Record<string, Entry[]>>({});
  const [searchString, setSearchString] = React.useState("");
  const [newFolderName, setNewFolderName] = React.useState("");
  const [newFileName, setNewFileName] = React.useState("");

  const refreshRoot = React.useCallback(async () => {
    try {
      const res = await fetch("/api/project/workspace");
      const body = await res.json();
      const ws: string = body?.data?.path ?? "";
      setWorkspace(ws);
      const entries = await readDir(ws);
      entries.sort((a, b) => (a.isDirectory === b.isDirectory ? a.name.localeCompare(b.name) : a.isDirectory ? -1 : 1));
      setRootEntries(entries);
    } catch (e) {
      toast.error(`读取工作目录失败：${e}`);
      setRootEntries([]);
    }
  }, []);

  React.useEffect(() => {
    void refreshRoot();
  }, [refreshRoot]);

  const toggleDir = async (dirPath: string) => {
    if (expanded[dirPath]) {
      setExpanded((prev) => {
        const next = { ...prev };
        delete next[dirPath];
        return next;
      });
      return;
    }
    try {
      const entries = await readDir(dirPath);
      entries.sort((a, b) => (a.isDirectory === b.isDirectory ? a.name.localeCompare(b.name) : a.isDirectory ? -1 : 1));
      setExpanded((prev) => ({ ...prev, [dirPath]: entries }));
    } catch (e) {
      toast.error(`读取目录失败：${e}`);
    }
  };

  const openPrg = async (fsPath: string) => {
    try {
      await onOpenFile(URI.file(fsPath), "WorkspaceFilesWindow");
      void TabWorkspace.close(tabId);
    } catch (e) {
      toast.error(String(e));
    }
  };

  const renameEntry = async (parentDir: string, entry: Entry) => {
    const oldPath = joinPath(parentDir, entry.name);
    const suggested = entry.isFile ? entry.name.replace(/\.prg$/i, "") : entry.name;
    const input = await Dialog.input("重命名", "输入新名字", { defaultValue: suggested });
    if (input === undefined || !input.trim()) return;
    let newName = input.trim();
    if (entry.isFile && !newName.toLowerCase().endsWith(".prg")) newName += ".prg";
    if (newName === entry.name) return;
    if (/[\\/:*?"<>|]/.test(newName)) {
      toast.error(`名字不能包含 \\ / : * ? " < > |`);
      return;
    }
    const newPath = joinPath(parentDir, newName);
    try {
      if (await exists(newPath)) {
        toast.error(`${newName} 已存在`);
        return;
      }
      await rename(oldPath, newPath);
      toast.success(`已重命名：${entry.name} → ${newName}`);
    } catch (e) {
      toast.error(`重命名失败：${e}`);
    }
    await refreshAfterChange(parentDir);
  };

  const removeEntry = async (parentDir: string, entry: Entry) => {
    const target = joinPath(parentDir, entry.name);
    const confirmed = await Dialog.confirm(
      "确认删除",
      `确定要删除 ${entry.isDirectory ? "文件夹" : "文件"} ${entry.name} 吗？${entry.isDirectory ? "（含全部内容，不可撤销）" : "此操作不可撤销。"}`,
      { destructive: true },
    );
    if (!confirmed) return;
    try {
      await remove(target, { recursive: true });
      toast.success(`已删除：${entry.name}`);
    } catch (e) {
      toast.error(`删除失败：${e}`);
    }
    await refreshAfterChange(parentDir);
  };

  const refreshAfterChange = async (parentDir: string) => {
    if (parentDir === workspace || !expanded[parentDir]) {
      await refreshRoot();
    }
    if (expanded[parentDir]) {
      try {
        const entries = await readDir(parentDir);
        entries.sort((a, b) => (a.isDirectory === b.isDirectory ? a.name.localeCompare(b.name) : a.isDirectory ? -1 : 1));
        setExpanded((prev) => ({ ...prev, [parentDir]: entries }));
      } catch {
        // 目录被删掉的情况：收起
        setExpanded((prev) => {
          const next = { ...prev };
          delete next[parentDir];
          return next;
        });
      }
    }
  };

  const createFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    if (/[\\/:*?"<>|]/.test(name)) {
      toast.error(`名字不能包含 \\ / : * ? " < > |`);
      return;
    }
    try {
      await mkdir(joinPath(workspace, name));
      toast.success(`已创建文件夹：${name}`);
      setNewFolderName("");
      await refreshRoot();
    } catch (e) {
      toast.error(`创建失败：${e}`);
    }
  };

  const createFile = async () => {
    let name = newFileName.trim();
    if (!name) return;
    if (/[\\/:*?"<>|]/.test(name)) {
      toast.error(`名字不能包含 \\ / : * ? " < > |`);
      return;
    }
    if (!name.toLowerCase().endsWith(".prg")) name += ".prg";
    const target = joinPath(workspace, name);
    try {
      if (await exists(target)) {
        toast.error(`${name} 已存在`);
        return;
      }
      await writeFile(target, new Uint8Array());
      toast.success(`已创建：${name}`);
      setNewFileName("");
      await refreshRoot();
    } catch (e) {
      toast.error(`创建失败：${e}`);
    }
  };

  const matchSearch = (name: string) => !searchString || name.toLowerCase().includes(searchString.toLowerCase());

  const renderEntry = (entry: Entry, parentDir: string, depth: number) => {
    const fullPath = joinPath(parentDir, entry.name);
    const isPrg = entry.isFile && entry.name.toLowerCase().endsWith(".prg");
    const children = expanded[fullPath];
    const isExpanded = !!children;

    return (
      <div key={fullPath}>
        <div
          className={cn(
            "group hover:bg-primary/10 flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-sm",
            !matchSearch(entry.name) && "hidden",
          )}
          onDoubleClick={() => {
            if (isPrg) void openPrg(fullPath);
            else if (entry.isDirectory) void toggleDir(fullPath);
          }}
        >
          <span
            className="flex w-4 shrink-0 cursor-pointer items-center justify-center"
            onClick={(e) => {
              e.stopPropagation();
              if (entry.isDirectory) void toggleDir(fullPath);
            }}
          >
            {entry.isDirectory &&
              (isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
          </span>
          {entry.isDirectory ? (
            <FolderOpen size={14} className="shrink-0 opacity-70" />
          ) : (
            <FileIcon size={14} className="shrink-0 opacity-70" />
          )}
          <span className={cn("truncate", !isPrg && entry.isFile && "opacity-50")}>{entry.name}</span>
          {!entry.isDirectory && <span className="shrink-0 text-xs opacity-40">{formatTime(entry.mtimeMs)}</span>}
          <span className="ml-auto flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            {isPrg && (
              <button
                title="打开"
                className="cursor-pointer rounded p-0.5 hover:bg-primary/20"
                onClick={(e) => {
                  e.stopPropagation();
                  void openPrg(fullPath);
                }}
              >
                <FolderOpen size={14} />
              </button>
            )}
            <button
              title="重命名"
              className="cursor-pointer rounded p-0.5 hover:bg-primary/20"
              onClick={(e) => {
                e.stopPropagation();
                void renameEntry(parentDir, entry);
              }}
            >
              <Pencil size={14} />
            </button>
            <button
              title="删除"
              className="cursor-pointer rounded p-0.5 text-destructive hover:bg-destructive/20"
              onClick={(e) => {
                e.stopPropagation();
                void removeEntry(parentDir, entry);
              }}
            >
              <Trash2 size={14} />
            </button>
          </span>
        </div>
        {entry.isDirectory && isExpanded && (
          <div className="ml-4 border-l pl-1">
            {children.length === 0 ? (
              <div className="px-1 py-0.5 text-xs opacity-40">（空）</div>
            ) : (
              children.map((child) => renderEntry(child, fullPath, depth + 1))
            )}
          </div>
        )}
      </div>
    );
  };

  const rootList = (rootEntries ?? []).filter((e) => matchSearch(e.name));

  return (
    <div className="flex h-full flex-col gap-2 overflow-auto p-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="truncate text-xs opacity-60" title={workspace}>
          工作目录：{workspace || "…"}
        </span>
        <button
          className="flex cursor-pointer items-center gap-1 rounded bg-primary/10 p-1.5 text-xs transition-colors hover:bg-primary/20"
          onClick={() => void refreshRoot()}
          title="刷新"
        >
          <RefreshCcw size={14} />
          刷新
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="筛选文件名…"
          value={searchString}
          onChange={(e) => setSearchString(e.target.value)}
          className="h-8 min-w-32 flex-1"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <div className="flex items-center gap-1">
          <FolderPlus size={14} />
          <Input
            placeholder="新文件夹名"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void createFolder();
            }}
            className="h-7 w-36"
          />
          <button
            className="cursor-pointer rounded bg-primary/10 p-1 transition-colors hover:bg-primary/20"
            onClick={() => void createFolder()}
          >
            创建
          </button>
        </div>
        <div className="flex items-center gap-1">
          <FilePlus size={14} />
          <Input
            placeholder="新文件名（.prg 可省略）"
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void createFile();
            }}
            className="h-7 w-44"
          />
          <button
            className="cursor-pointer rounded bg-primary/10 p-1 transition-colors hover:bg-primary/20"
            onClick={() => void createFile()}
          >
            创建
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {rootEntries === null ? (
          <div className="flex h-full items-center justify-center opacity-50">加载中…</div>
        ) : rootList.length === 0 ? (
          <div className="flex h-full items-center justify-center opacity-50">
            {searchString ? "无匹配条目" : "工作目录为空"}
          </div>
        ) : (
          rootList.map((entry) => renderEntry(entry, workspace, 0))
        )}
      </div>
    </div>
  );
}

WorkspaceFilesWindow.open = () => {
  createSubWindow("WorkspaceFilesWindow", {
    title: "工作目录",
    contextTarget: "activeResourceTab",
    children: (tab) => <WorkspaceFilesWindow tabId={tab.id} />,
  });
};
