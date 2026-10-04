// nx-pg：简易快捷键设置页。
// 原版 keybinds.tsx 依赖 shadcn Sidebar 生态（在 nx-pg 环境触发 React #130，轮 5 教训），
// 本页用 Collapsible 平铺分组 + Field/KeyBind/Switch 组合实现同能力：
// 列表（excludedCommands 过滤已删命令）· 录键改键 · 启用开关 · 重置默认 · 冲突提示。
import KeyBind from "@/components/ui/key-bind";
import { Switch } from "@/components/ui/switch";
import { KeyBindsUI } from "@/core/service/controlService/shortcutKeysEngine/KeyBindsUI";
import {
  allKeyBinds,
  getKeyBindTypeById,
} from "@/core/service/controlService/shortcutKeysEngine/shortcutKeysRegister";
import { isExcludedCommand } from "@/core/service/excludedCommands";
import { shortcutKeysGroups } from "@/core/service/shortcutKeysGroups";
import { createStore } from "@/utils/store";
import { isMac } from "@/utils/platform";
import { transEmacsKeyWinToMac } from "@/utils/emacs";
import { formatKeyBindSequenceToString, isKeyBindOverlap } from "@/utils/keyDisplay";
import { KeyboardOff, RotateCw, SquareAsterisk, SquareRoundCorner, SquareStack } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { createSubWindow } from "@/core/subWindowOpen";
import { Vector } from "@graphif/data-structures";
import { Rectangle } from "@graphif/shapes";

type KeyBindData = { id: string; key: string; isEnabled: boolean };

export default function KeyBindsSettingsPanel() {
  const [data, setData] = useState<KeyBindData[]>([]);
  const { t } = useTranslation("keyBinds");
  const { t: tGroup } = useTranslation("keyBindsGroup");

  useEffect(() => {
    void (async () => {
      const store = await createStore("keybinds2.json");
      const list: KeyBindData[] = [];
      for (const kb of allKeyBinds.filter((item) => !item.isGlobal && !isExcludedCommand(item.id))) {
        const saved = await store.get<any>(kb.id);
        let key: string;
        let isEnabled: boolean;
        if (!saved) {
          key = kb.defaultKey;
          isEnabled = kb.defaultEnabled !== false;
        } else if (typeof saved === "string") {
          key = saved;
          isEnabled = kb.defaultEnabled !== false;
        } else {
          key = saved.key;
          isEnabled = saved.isEnabled !== false;
        }
        list.push({ id: kb.id, key, isEnabled });
      }
      setData(list);
    })();
  }, []);

  const grouped = useMemo(() => {
    const groups = shortcutKeysGroups.map((g) => ({
      title: g.title as string,
      keys: g.keys.filter((id) => data.some((d) => d.id === id)),
    }));
    const groupedIds = new Set(shortcutKeysGroups.flatMap((g) => g.keys));
    const ungrouped = data.filter((d) => !groupedIds.has(d.id)).map((d) => d.id);
    if (ungrouped.length > 0) groups.push({ title: "otherKeys", keys: ungrouped });
    return groups.filter((g) => g.keys.length > 0);
  }, [data]);

  const detectConflicts = (targetKey: string, targetId: string) => {
    const target = allKeyBinds.find((kb) => kb.id === targetId);
    const targetContinuous = target?.isContinuous ?? false;
    return data.filter((item) => {
      if (item.id === targetId || !item.isEnabled) return false;
      const kb = allKeyBinds.find((x) => x.id === item.id);
      if ((kb?.isContinuous ?? false) !== targetContinuous) return false;
      return isKeyBindOverlap(item.key, targetKey);
    });
  };

  const renderRow = (id: string) => {
    const item = data.find((d) => d.id === id);
    const kb = allKeyBinds.find((x) => x.id === id);
    if (!item || !kb) return null;
    const conflicts = detectConflicts(item.key, id);
    const conflictsText =
      conflicts.length > 0
        ? `⚠ 与 ${conflicts.map((c) => t(`${c.id}.title`, { defaultValue: c.id })).join("、")} 重叠`
        : "";

    const icon = (() => {
      if (!item.key || item.key.trim() === "") return <span className="text-xs opacity-40">未绑定</span>;
      if (!item.isEnabled) return <KeyboardOff className="size-4 opacity-50" />;
      if (kb.isContinuous) return <SquareAsterisk className="size-4" />;
      const parts = item.key.trim().split(" ");
      if (parts.length > 1) return <SquareStack className="size-4" />;
      return parts[0].includes("-") ? <KeyboardOff className="size-4" /> : <SquareRoundCorner className="size-4" />;
    })();

    return (
      <div key={id} className="border-border/60 flex items-center gap-3 border-b py-2.5">
        <div className="flex w-8 shrink-0 justify-center">{icon}</div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{t(`${id}.title`, { defaultValue: id })}</div>
          {conflictsText && <div className="text-destructive text-xs">{conflictsText}</div>}
        </div>
        <RotateCw
          className="text-muted-foreground size-4 shrink-0 cursor-pointer opacity-50 hover:rotate-180 hover:opacity-100"
          title="重置为默认"
          onClick={() => {
            let def = kb.defaultKey;
            if (isMac) def = transEmacsKeyWinToMac(def);
            setData((d) => d.map((it) => (it.id === id ? { ...it, key: def } : it)));
            void KeyBindsUI.changeOneUIKeyBind(id, def);
            toast.success(`已重置为 ${formatKeyBindSequenceToString(def, "+", ",") || "（空）"}`);
          }}
        />
        <KeyBind
          key={item.key}
          defaultValue={item.key}
          isContinuous={kb.isContinuous}
          onChange={(value) => {
            setData((d) => d.map((it) => (it.id === id ? { ...it, key: value } : it)));
            const type = getKeyBindTypeById(id);
            if (type === "global") {
              toast.message(`已设为 '${value}'，全局快捷键需重启生效`);
            } else {
              void KeyBindsUI.changeOneUIKeyBind(id, value);
            }
          }}
        />
        <label className="flex shrink-0 items-center gap-1.5 text-xs">
          启用
          <Switch
            checked={item.isEnabled}
            onCheckedChange={async (checked) => {
              setData((d) => d.map((it) => (it.id === id ? { ...it, isEnabled: checked } : it)));
              await KeyBindsUI.toggleEnabled(id);
            }}
          />
        </label>
      </div>
    );
  };

  if (data.length === 0) {
    return <div className="text-muted-foreground p-4 text-sm">正在加载快捷键列表…</div>;
  }

  return (
    <div className="flex h-full flex-col gap-1 overflow-auto p-4 text-sm">
      <h2 className="text-base font-bold">快捷键设置</h2>
      <p className="text-muted-foreground text-xs mb-2">
        点击键位框后按下新按键组合即可改键；序列键（如 q e）依次按下单键录入。改动即时生效并持久化。
      </p>
      {grouped.map((group) => (
        <section key={group.title} className="mb-3">
          <h3 className="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">
            {tGroup(`${group.title}.title`, { defaultValue: group.title })}
          </h3>
          {group.keys.map(renderRow)}
        </section>
      ))}
    </div>
  );
}

/** 独立窗口入口：设置面板「快捷键设置」按钮与未来菜单/命令面板共用 */
export function openKeyBindsSettings() {
  createSubWindow("KeyBindsSettingsWindow", {
    title: "快捷键设置",
    contextTarget: "activeResourceTab",
    children: () => <KeyBindsSettingsPanel />,
    rect: new Rectangle(new Vector(120, 80), new Vector(680, 620)),
  });
}
