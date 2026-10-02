// tauri-plugin-system-info-api shim：浏览器用 navigator.hardwareConcurrency 顶替。
// 原插件返回 { cpus: [{ brand }], cpu_count }，App.tsx 启动遥测读 cpu.cpus[0].brand。
export type CpuInfo = { cpus: { brand: string }[]; cpu_count: number };
export async function cpuInfo(): Promise<CpuInfo> {
  const count = navigator.hardwareConcurrency ?? 1;
  const brand = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform
    ?? navigator.platform
    ?? "unknown";
  return {
    cpus: Array.from({ length: Math.max(1, count) }, () => ({ brand })),
    cpu_count: count,
  };
}
