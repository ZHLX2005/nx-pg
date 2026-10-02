// react-i18next shim：浏览器运行时 React 19 + esbuild + react-i18next@15.2 在模块初始化阶段
// 抛 "Vke is not a function"（初始化顺序 / 内部 helper 时机问题）。
// 这里提供最薄占位：useTranslation 返回固定 hook，t() 返回 key 原值，Trans 渲染 children。
import { createContext, useContext } from "react";
import type { ReactNode } from "react";

type TFunction = (key: string, opts?: unknown) => string;
const ctx = createContext<{ t: TFunction; i18n: { language: string } }>({
  t: (k: string) => k,
  i18n: { language: "en" },
});

export function useTranslation(): { t: TFunction; i18n: { language: string } } {
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