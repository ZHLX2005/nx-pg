// ---------- @tauri-apps/plugin-cli ----------
// 命令行参数解析：web 版没有 CLI 启动参数，恒返回空匹配。
export interface CliMatches {
  args: Record<string, { value: unknown; occurrences: number }>;
  subcommand?: { name: string; matches: CliMatches };
}
export async function getMatches(): Promise<CliMatches> {
  return { args: {} };
}
