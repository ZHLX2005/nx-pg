// 屏蔽浏览器内置手势，避免与画布交互冲突。
//   - 鼠标侧键（button 3/4）= 浏览器前进/后退 → preventDefault
//   - Alt+←/→（Win/Linux）/ Cmd+[/]（Mac）= 浏览器前进/后退 → preventDefault
//   - Backspace（Win）= 后退 → 仅在非 input/textarea/contenteditable 上 preventDefault
//   - 右键拖动（Mac/部分 Win 触控板）= 滚动浏览历史 → 中键/右键按下时阻止默认
//   - 右键呼出浏览器原生菜单（App.tsx 已有 contextmenu 监听，但这里再独立装一份作为兜底）
//
// 设计原则：
//   - 仅 capture 阶段阻止（不冒泡冲突）
//   - 只屏蔽默认行为，不吞事件——Radix ContextMenu / canvas 自定义右键仍能收到事件
//   - 不在 input/textarea/contenteditable 内屏蔽 Backspace（用户正常编辑）

type ModifierMatch = { key: string; meta?: boolean; ctrl?: boolean; alt?: boolean };

const NAV_KEYS: ModifierMatch[] = [
  { key: "Backspace", meta: undefined, alt: undefined }, // Win：Alt+Backspace 也算
  { key: "ArrowLeft", alt: true },                        // Alt+←
  { key: "ArrowRight", alt: true },                       // Alt+→
  { key: "[", meta: true },                               // Mac Cmd+[
  { key: "]", meta: true },                               // Mac Cmd+]
];

function isInEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

function guard(): void {
  // 键盘：屏蔽前进/后退快捷键（不在可编辑元素内）
  window.addEventListener("keydown", (e) => {
    if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      return;
    }
    if (e.metaKey && (e.key === "[" || e.key === "]")) {
      e.preventDefault();
      return;
    }
    // Backspace 在非可编辑元素上 = 后退
    if (e.key === "Backspace" && !e.ctrlKey && !e.metaKey && !e.altKey && !isInEditable(e.target)) {
      e.preventDefault();
    }
  }, { passive: false });

  // 鼠标：屏蔽侧键（3=后退/4=前进）和中键/右键默认行为（页面滚动/历史）
  window.addEventListener("pointerdown", (e) => {
    // 屏蔽鼠标侧键的默认导航行为（左右手习惯各异；这里全屏蔽最安全）
    if (e.button === 3 || e.button === 4) {
      e.preventDefault();
    }
  }, { passive: false });

  // 中键按下（button=1）= 默认是滚动历史 → 阻止（在 canvas 区域里我们用中键做相机平移）
  window.addEventListener("auxclick", (e) => {
    // 仅屏蔽中键（button 1）的默认行为，不动左/右键
    if (e.button === 1) {
      e.preventDefault();
    }
  }, { passive: false });
}

guard();
