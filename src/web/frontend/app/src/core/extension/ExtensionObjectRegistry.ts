// 插件扩展的实体注册表：空实现。ControllerExtensionEntityClick / ExtensionEntityRenderer 用 no-op。
export const extensionObjectRegistry = {
  register(_cls: unknown): void {},
  get(_name: string): unknown | undefined {
    return undefined;
  },
};
