// nx-pg：去掉 next-themes 依赖。主题色直接读 localStorage（与 Settings 同步的主题 id 字段）。
import { Toaster as Sonner, ToasterProps } from "sonner";

function readTheme(): ToasterProps["theme"] {
  try {
    const s = JSON.parse(localStorage.getItem("nxpg-store:settings.json") ?? "{}");
    const id = (s?.theme || "dark") as string;
    // dark 类型 → "dark"，light → "light"；其余也映射到 light
    if (id === "dark") return "dark";
    return "light";
  } catch {
    return "light";
  }
}

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme={readTheme()}
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };