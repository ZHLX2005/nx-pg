export class ExtensionManager {
  static async init(): Promise<void> {}
  static async dispose(): Promise<void> {}
  static getExtensions(): unknown[] { return []; }
}
export const extensionManager = new ExtensionManager();
