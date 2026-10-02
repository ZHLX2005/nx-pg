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

// 主题列表直接来自 themes/*.yml 的 frontmatter，不再手写 id 列表。
// 手写列表必然会漏（之前就漏了 lightTheme 默认值 morandi，导致 <select> 显示空白），
// 而漏掉的那个 id 恰好是明暗开关要用的默认亮色主题 —— 漏了等于开关切回去是空的。
// name 字段在前端 yml 里已经是中文（「黑夜」「莫兰迪」…），直接用即可。
const THEME_OPTIONS = Themes.builtinThemes.map((t) => ({ id: t.metadata.id, label: t.metadata.name }));

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
              const id = e.target.value;
              setTheme(id);
              // 记住「这种明暗各自上次用的哪个主题」，供标题栏的明暗开关来回切。
              // 必须记在**用户动作**里而不是 App.tsx 的 watch 链里：
              // watch 链里回写 lightTheme/darkTheme 正是轮 4 死循环的成因
              // （Settings 的 set trap 无条件通知 listeners，A 改 B、B 改 A 会成环）。
              const type = Themes.builtinThemes.find((t) => t.metadata.id === id)?.metadata.type;
              if (type === "light") {
                (Settings as Record<string, unknown>).lightTheme = id;
              } else if (type === "dark") {
                (Settings as Record<string, unknown>).darkTheme = id;
              }
            }}
          >
            {/* 选项直接来自 themes/*.yml（前端 metadata.name 已是中文，如「黑夜」「莫兰迪」）。
                之前这里硬编码 4 个 id，漏掉了 lightTheme 的默认值 morandi ——
                结果 <select value> 匹配不到任何 option，控件显示成空白，用户以为坏了。 */}
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
