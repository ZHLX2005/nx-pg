// virtual:original-class-name 的替代实现。
// 原项目用 unplugin-original-class-name 在构建期改写 class，保证压缩后仍能拿到原始类名。
// web 版不做代码混淆压缩（esbuild minify 保留类名 enough），直接用 constructor.name 即可。
export function getOriginalNameOf(class_: { className?: string; name: string }): string {
  return class_.className ?? class_.name;
}
