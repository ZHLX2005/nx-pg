// nx-pg stub: 原 toolbar 来自 plate UI 套件。P0 范围不重做富文本编辑，
// 这里给最小占位：返回 <div> 让 RightToolbar 不报错。
import type { ReactNode } from "react";

export function Toolbar({ children }: { children?: ReactNode }) {
  return <div data-toolbar-stub>{children}</div>;
}
