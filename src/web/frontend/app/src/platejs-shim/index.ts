// platejs stub：原项目用它做节点详情区的富文本编辑器（与 plate UI 套件 + 装饰器结合）。
// nx-pg 删了所有 plate UI 组件后，剩 7 个 .ts/.tsx 还 import "platejs"，其中 6 个是
// `import type { Value } from "platejs"` —— 节点详情区的 markdown 内容描述。
// 这里只声明类型，不引入运行时；详情区的渲染走我们自己的 markdownToDetails。
export type Value = unknown;
export const usePlateEditor = () => ({});
export const createPlateEditor = () => ({});
export const Plate = () => null;
export const PlateLeaf = () => null;
export const PlateElement = () => null;
export const withProps = <T,>(_c: unknown, _p: T) => null;
