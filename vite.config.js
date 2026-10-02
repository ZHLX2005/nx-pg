import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import ViteYaml from '@modyfi/vite-plugin-yaml';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 前端源码根下的文件会被暴露成 URL：src/web/frontend/api/client.js → /api/client.js。
// 而 /api 又是后端接口前缀，于是前端自己的模块请求会被代理吞掉——
// 浏览器拿到一坨 JSON、import 失败、整页白屏。
//
// 这是 Vite root 与服务端前缀的天然冲突：靠「目录别叫 api」这种约定防不住，
// 新增一个同名目录就会重现。所以按「是不是前端资源」决定走不走代理。
//
// ⚠️ 这段逻辑是骨架的一部分，别删也别改语义——它被单测钉着，
//    改坏的话 dev 模式会整页白屏，而且只在特定路径上出现，很难查。
const FRONTEND_ASSET = /\.(jsx?|mjs|cjs|tsx?|css|map|svg|png|jpe?g|webp|ico|woff2?)$/i;

export function shouldServeLocally(url) {
  const path = String(url || '').split('?')[0];
  return FRONTEND_ASSET.test(path) ? path : undefined; // 真值 = 交回 Vite
}

export default defineConfig({
  root: 'src/web/frontend',
  plugins: [tailwindcss(), ViteYaml(), react()],
  resolve: {
    alias: {
      // 迁移的 project-graph 源码全部用 @/ 前缀互相引用，alias 保持原路径零改动
      '@': path.resolve(__dirname, 'src/web/frontend/app/src'),
      // Tauri API → 浏览器 shim（fs 走 server、dialog 走 File System Access、剪贴板走 navigator.clipboard…）
      '@tauri-apps/api/core': path.resolve(__dirname, 'src/web/frontend/app/shims/api-core.ts'),
      '@tauri-apps/api/path': path.resolve(__dirname, 'src/web/frontend/app/shims/api-core.ts'),
      '@tauri-apps/api/window': path.resolve(__dirname, 'src/web/frontend/app/shims/api-core.ts'),
      '@tauri-apps/api/app': path.resolve(__dirname, 'src/web/frontend/app/shims/api-core.ts'),
      '@tauri-apps/api/event': path.resolve(__dirname, 'src/web/frontend/app/shims/api-core.ts'),
      '@tauri-apps/api/image': path.resolve(__dirname, 'src/web/frontend/app/shims/api-core.ts'),
      '@tauri-apps/api/dpi': path.resolve(__dirname, 'src/web/frontend/app/shims/api-core.ts'),
      '@tauri-apps/plugin-fs': path.resolve(__dirname, 'src/web/frontend/app/shims/plugin-fs.ts'),
      '@tauri-apps/plugin-dialog': path.resolve(__dirname, 'src/web/frontend/app/shims/plugin-dialog.ts'),
      '@tauri-apps/plugin-clipboard-manager': path.resolve(__dirname, 'src/web/frontend/app/shims/plugin-clipboard-manager.ts'),
      '@tauri-apps/plugin-store': path.resolve(__dirname, 'src/web/frontend/app/shims/plugin-store.ts'),
      '@tauri-apps/plugin-os': path.resolve(__dirname, 'src/web/frontend/app/shims/plugin-os.ts'),
      '@tauri-apps/plugin-shell': path.resolve(__dirname, 'src/web/frontend/app/shims/plugin-shell.ts'),
      '@tauri-apps/plugin-http': path.resolve(__dirname, 'src/web/frontend/app/shims/plugin-http.ts'),
      '@tauri-apps/plugin-cli': path.resolve(__dirname, 'src/web/frontend/app/shims/plugin-cli.ts'),
      '@tauri-apps/plugin-global-shortcut': path.resolve(__dirname, 'src/web/frontend/app/shims/plugin-global-shortcut.ts'),
      '@tauri-apps/plugin-updater': path.resolve(__dirname, 'src/web/frontend/app/shims/plugin-updater.ts'),
      '@tauri-apps/plugin-deep-link': path.resolve(__dirname, 'src/web/frontend/app/shims/plugin-deep-link.ts'),
      '@tauri-apps/plugin-window-state': path.resolve(__dirname, 'src/web/frontend/app/shims/plugin-window-state.ts'),
      // unplugin-original-class-name 的替代：web 版不混淆，直接读 constructor.name
      'virtual:original-class-name': path.resolve(__dirname, 'src/web/frontend/app/src/virtual/original-class-name.ts'),
      // nx-pg 不安装 tauri 专属插件；指向浏览器 stub（cpuInfo 来自 navigator.hardwareConcurrency）
      'tauri-plugin-system-info-api': path.resolve(__dirname, 'src/web/frontend/app/shims/tauri-plugin-system-info-api.ts'),
      // lucide-react 整体占位：详见 src/web/frontend/app/src/lucide-stub.tsx
      'lucide-react': path.resolve(__dirname, 'src/web/frontend/app/src/lucide-stub.tsx'),
      // react-i18next 占位：详见 src/web/frontend/app/src/react-i18next-stub.ts
      'react-i18next': path.resolve(__dirname, 'src/web/frontend/app/src/react-i18next-stub.ts'),
      // platejs 已被项目代码 import type { Value } 等；指向最薄的 stub（带 /react 子路径）
      'platejs$': path.resolve(__dirname, 'src/web/frontend/app/src/platejs-shim/index.ts'),
      'platejs/react': path.resolve(__dirname, 'src/web/frontend/app/src/platejs-shim/react.ts'),
    },
  },
  build: {
    outDir: '../public',
    emptyOutDir: true,
    chunkSizeWarningLimit: 4096,
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      // 不 external 任何 npm 依赖——浏览器运行时 import 必须能被解析。
      // 真正不需要的依赖（被 stub 替换或不在主路径）通过移除 import 路径来排除。
      // 之前用 external 让 bundle 留下裸 import "package" 语句，运行时 Failed to resolve，已删。
      external: [],
    },
  },
  server: {
    port: 7885,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:7888',
        bypass: (req) => shouldServeLocally(req.url),
      },
    },
  },
});
