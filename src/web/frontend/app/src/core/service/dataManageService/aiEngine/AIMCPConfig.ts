// 占位模块：完整功能不在 nx-pg 范围（P0 = 画布交互复刻）。所有 export 为 no-op 类型 stub。
const noop = () => {};
const noopAsync = async () => {};
export const placeholder = { init: noopAsync, dispose: noopAsync };
export function placeholderFunction(): void {}
export default {};
