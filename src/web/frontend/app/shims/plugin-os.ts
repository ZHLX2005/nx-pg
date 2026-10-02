// ---------- @tauri-apps/plugin-os ----------
export const isWeb = true;
export function platform(): "windows" | "macos" | "linux" | "android" | "ios" {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("windows")) return "windows";
  if (ua.includes("mac os")) return "macos";
  if (ua.includes("android")) return "android";
  if (ua.includes("iphone") || ua.includes("ipad")) return "ios";
  return "linux";
}
export function family(): "windows" | "unix" {
  return platform() === "windows" ? "windows" : "unix";
}
export function arch(): string {
  const ua = navigator.userAgent;
  if (ua.includes("arm") || ua.includes("aarch")) return "aarch64";
  return "x86_64";
}
export function version(): string {
  const m = navigator.userAgent.match(/(?:Chrome|Firefox|Safari)\/([\d.]+)/);
  return m?.[1] ?? "unknown";
}
export function hostname(): string {
  return location.hostname;
}
export function locale(): string {
  return navigator.language;
}
export const EXE = "";
export const EXTENSION = "";
export const EOL = "\n";
