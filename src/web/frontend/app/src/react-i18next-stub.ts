// react-i18next shim：浏览器运行时 React 19 + esbuild + react-i18next@15.2 在模块初始化阶段
// 抛 "Vke is not a function"（初始化顺序 / 内部 helper 时机问题）。
// 这里提供最薄占位：useTranslation 返回固定 hook；t() 直接委托给底层 i18next 真实例
// （i18next 已由 main.tsx 加载 zh_CN/en 资源）。
//
// 调用约定兼容原 project-graph：
//   t(key)                                 → i18next.t(key)
//   t(key, "默认文案")                     → 找不到时回退 "默认文案"
//   t(key, { ns, defaultValue })           → 标准 i18next 选项
//
// nx-pg：所有菜单 / 设置面板的 t() 调用在传入 namespace 时常常跟 key 的真实 namespace 不一致
// （如 useTranslation("keyBinds").t("file.title")），所以这里在 i18next 真包找不到时
// 再用「所有 namespace 全量扫描 key 路径」兜底，最大限度保证 UI 文本能从 key 翻译成中文。
import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import i18next from "i18next";

type TFunction = (
  key: string,
  opts?: string | { ns?: string; defaultValue?: string },
) => string;

function resolveDefault(
  opts: string | { ns?: string; defaultValue?: string } | undefined,
  key: string,
): string {
  if (typeof opts === "string") return opts;
  return opts?.defaultValue ?? key;
}

/**
 * 在 i18next 已加载的所有资源里，按 key 路径（如 "file.title"）查找第一个命中的字符串。
 * nx-pg 默认只显示中文，优先 zh_CN；en 只在 zh_CN 缺该 key 时兜底。
 * 找到返回字符串；找不到返回 undefined。
 */
function lookupAllNamespaces(key: string): string | undefined {
  if (!key) return undefined;
  const resources = (i18next as { options?: { resources?: Record<string, Record<string, unknown>> } }).options
    ?.resources;
  if (!resources) return undefined;
  const parts = key.split(".");
  // nx-pg：优先中文，en 兜底
  const langOrder = ["zh_CN", "zh_TW", "en"];
  for (const lang of langOrder) {
    if (!resources[lang]) continue;
    const namespaces = resources[lang];
    for (const ns of Object.keys(namespaces)) {
      let cur: unknown = namespaces[ns];
      for (const p of parts) {
        if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
          cur = (cur as Record<string, unknown>)[p];
        } else {
          cur = undefined;
          break;
        }
      }
      if (typeof cur === "string") return cur;
    }
  }
  return undefined;
}

const ctx = createContext<{ t: TFunction; i18n: { language: string } }>({
  t: (k, opts) => {
    const ns = typeof opts === "object" && opts ? opts.ns : undefined;
    const fallback = resolveDefault(opts, k);
    if (i18next.isInitialized) {
      const v = i18next.t(k, { ns, defaultValue: "" });
      if (v && v !== k) return v;
      const scan = lookupAllNamespaces(k);
      if (scan) return scan;
    }
    return fallback;
  },
  i18n: { language: i18next.language || "zh_CN" },
});

export function useTranslation(_ns?: string): { t: TFunction; i18n: { language: string } } {
  // useSyncExternalStore 与 react-i18next 内部实现时机在 React 19 + esbuild 下冲突，
  // 这里退回最简形态：返回的 t 直接代理到全局 i18next（已加载 zh_CN），
  // 语言变更通过组件自身 watch 触发重渲染（少数使用 i18n.language 的地方）。
  return useContext(ctx);
}

export function Trans({ children }: { children?: ReactNode }) {
  return children as unknown as ReactNode;
}

export function withTranslation() {
  return function <T>(_component: T) {
    return _component;
  };
}

// i18next 要求 use() 的入参是 { type: '3rdParty', init(i18n) } 对象（不是返回它的函数）
export const initReactI18next = {
  type: "3rdParty" as const,
  init() {
    /* nx-pg：不做 i18n 运行时绑定 */
  },
};

export function I18nextProvider(props: { children?: ReactNode }) {
  return props.children as unknown as ReactNode;
}

export const I18nContext = ctx;
