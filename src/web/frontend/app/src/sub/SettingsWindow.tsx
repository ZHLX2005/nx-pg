// nx-pg 最小设置面板：主题 / 背景网点 / 渲染 FPS / 手柄死区。
// 轮 5 曾尝试移植原版 schema 驱动的 settings.tsx（150+ 设置项 + 多 tab），
// 但原版 sidebar.tsx 在 nx-pg 环境下报 React #130（缺 SidebarProvider 等关键依赖）。
// 个人高频项保留在这里，完整面板待原 sidebar.tsx 适配后再统一接入。
import { Settings } from "@/core/service/Settings";
import { Themes } from "@/core/service/Themes";
import { createSubWindow } from "@/core/subWindowOpen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Vector } from "@graphif/data-structures";
import { Rectangle } from "@graphif/shapes";
import { Keyboard } from "lucide-react";
import { useSyncExternalStore } from "react";
import KeyBindsSettingsPanel, { openKeyBindsSettings } from "@/sub/KeyBindsSettingsWindow";

function useSetting<K extends string>(key: K): [unknown, (v: unknown) => void] {
  const subscribe = (cb: () => void) => Settings.watch(key, () => cb());
  const value = useSyncExternalStore(
    subscribe,
    () => (Settings as Record<string, unknown>)[key],
    () => (Settings as Record<string, unknown>)[key],
  );
  const set = (v: unknown) => {
    (Settings as Record<string, unknown>)[key] = v;
  };
  return [value, set];
}

const THEME_OPTIONS = Themes.builtinThemes.map((t) => ({ id: t.metadata.id, label: t.metadata.name }));

export default function SettingsPanel() {
  const [theme, setTheme] = useSetting("theme");
  const [showBgDots, setShowBgDots] = useSetting("showBackgroundDots");
  const [maxFps, setMaxFps] = useSetting("maxFps");
  const [deadzone, setDeadzone] = useSetting("gamepadDeadzone");
  const [wrapImageInGroup, setWrapImageInGroup] = useSetting("wrapImageInGroup");

  return (
    <div className="text-foreground flex h-full flex-col gap-4 overflow-auto p-4 text-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">设置</h2>
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => openKeyBindsSettings()}>
          <Keyboard className="size-4" />
          快捷键设置
        </Button>
      </div>

      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">外观</h3>
        <label className="flex items-center justify-between gap-4">
          <span>主题</span>
          <select
            className="bg-card border-border rounded border px-2 py-1"
            value={String(theme)}
            onChange={(e) => {
              const id = e.target.value;
              setTheme(id);
              const type = Themes.builtinThemes.find((t) => t.metadata.id === id)?.metadata.type;
              if (type === "light") {
                (Settings as Record<string, unknown>).lightTheme = id;
              } else if (type === "dark") {
                (Settings as Record<string, unknown>).darkTheme = id;
              }
            }}
          >
            {THEME_OPTIONS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center justify-between gap-4">
          <span>背景网点</span>
          <Switch checked={!!showBgDots} onCheckedChange={(v) => setShowBgDots(v)} />
        </label>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">渲染</h3>
        <label className="flex items-center justify-between gap-4">
          <span>最大 FPS</span>
          <Input
            type="number"
            className="w-24"
            value={String(maxFps)}
            onChange={(e) => setMaxFps(Math.max(1, Math.min(240, Number(e.target.value) || 60)))}
          />
        </label>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">图片</h3>
        <label className="flex items-center justify-between gap-4">
          <span>粘贴图片后自动打框（Ctrl+G）</span>
          <Switch checked={!!wrapImageInGroup} onCheckedChange={(v) => setWrapImageInGroup(v)} />
        </label>
        <p className="text-muted-foreground text-xs">
          开启后，粘贴/拖入的图片会自动包进一个分组框（相当于贴完自动按一次 Ctrl+G）。
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">手柄</h3>
        <label className="flex items-center justify-between gap-4">
          <span>摇杆死区（0~1）</span>
          <Input
            type="number"
            step="0.05"
            min="0"
            max="1"
            className="w-24"
            value={String(deadzone)}
            onChange={(e) => setDeadzone(Math.max(0, Math.min(1, Number(e.target.value) || 0.1)))}
          />
        </label>
        <p className="text-muted-foreground text-xs">
          手柄映射：左摇杆=平移视口 · A=重置视野 · B=停止 · LB/RB=缩放 · Start=保存
        </p>
      </section>
    </div>
  );
}

SettingsPanel.open = (_section?: string) => {
  createSubWindow("SettingsWindow", {
    title: "设置",
    contextTarget: "activeResourceTab",
    children: () => <SettingsPanel />,
    rect: new Rectangle(new Vector(80, 80), new Vector(420, 480)),
  });
};

SettingsPanel.close = () => {};
SettingsPanel.closeAll = () => {};
