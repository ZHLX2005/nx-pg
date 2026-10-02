// nx-pg 最小设置面板：主题 / 背景网点 / 渲染 FPS / 手柄死区。
// 完整的原版 SettingsWindow（keybinds/extensions/ai 等多面板）不在 P0 范围；
// 这里提供个人使用的高频项，全部经 Settings proxy 双向绑定（localStorage 持久化）。
import { Settings } from "@/core/service/Settings";
import { Themes } from "@/core/service/Themes";
import { createSubWindow } from "@/core/subWindowOpen";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Vector } from "@graphif/data-structures";
import { Rectangle } from "@graphif/shapes";
import { useSyncExternalStore } from "react";

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

const THEME_OPTIONS = [
  { id: "dark", label: "黑夜" },
  { id: "light", label: "白天" },
  { id: "catppuccin-mocha", label: "Catppuccin Mocha" },
  { id: "catppuccin-latte", label: "Catppuccin Latte" },
];

export default function SettingsPanel() {
  const [theme, setTheme] = useSetting("theme");
  const [showBgDots, setShowBgDots] = useSetting("showBackgroundDots");
  const [maxFps, setMaxFps] = useSetting("maxFps");
  const [deadzone, setDeadzone] = useSetting("gamepadDeadzone");

  return (
    <div className="text-foreground flex h-full flex-col gap-4 overflow-auto p-4 text-sm">
      <h2 className="text-lg font-bold">设置</h2>

      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">外观</h3>
        <label className="flex items-center justify-between gap-4">
          <span>主题</span>
          <select
            className="bg-card border-border rounded border px-2 py-1"
            value={String(theme)}
            onChange={(e) => {
              setTheme(e.target.value);
              void Themes.applyThemeById(e.target.value);
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
