// Telemetry 桩：原项目用于上报事件到开发者后端。nx-pg 是个人本地使用，删除。
export namespace Telemetry {
  export function event(_name: string, _props?: Record<string, unknown>): Promise<unknown> {
    return Promise.resolve();
  }
}
