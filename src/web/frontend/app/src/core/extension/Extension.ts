// 插件扩展机制：原项目支持运行时注册插件。nx-pg 个人本地使用，不需要。
export interface Extension {
  id: string;
}
export const Extension = {} as unknown as Extension;
