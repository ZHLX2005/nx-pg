// ESLint 扁平配置。
//
// 这里主要管的不是代码风格（那个交给约定与编辑器），而是**分层约束**：
// 把「谁可以依赖谁」写成机器可检查的规则。架构意图一旦只写在文档里，
// 就会随提交次数慢慢衰减；写成 lint 规则则会当场拦下。
import { defineConfig } from 'eslint/config';
import { parser } from 'typescript-eslint';

const BASE_RULES = {
  'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  'no-undef': 'off', // 浏览器/Node 全局混用，靠运行时暴露；装 globals 包不值得
  eqeqeq: ['error', 'smart'],
  'prefer-const': 'error',
  'no-var': 'error',
  'no-console': 'off', // CLI 工具，输出就是产品
};

export default defineConfig([
  { ignores: ['src/web/public/**', 'node_modules/**', 'templates/**', 'src/web/frontend/app/**', '.tool/**', '.claude/**'] },
  {
    files: ['**/*.{js,mjs,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: BASE_RULES,
  },

  // ---- 分层约束（对应主文档「依赖只能向下 core ← modules ← runtime」）----

  {
    // core 是最底层：零业务语义的基础设施。它一旦依赖上层，分层就塌了。
    files: ['src/core/**/*.js'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../modules/**', '../runtime/**', '../web/**'],
              message: 'core 是最底层，不得依赖 modules / runtime / web。',
            },
          ],
        },
      ],
    },
  },

  {
    // 模块之间禁止互相依赖，需要共享的下沉到 core/。
    //
    // 写法说明：gitignore 风格的 group negation（'!../core/**'）只对单级父目录
    // （'../core/x'）生效——subject 带 '..' 多级跳转时 ignore 匹配器会失灵
    // （实测 '../../core/paths.js' 无法被任何 '!...' 白名单放行）。
    // 所以这里用两条 regex 精确表达「允许 ../ 或 ../../ 落到 core/ 或 web/frontend/，
    // 其余跨模块目录一律禁止」：
    //   regex1  单级跳 '../X'   且 X 不是 core / web/frontend
    //   regex2  双级跳 '../../X' 且 X 不是 core / web/frontend
    // './'（模块内部）与裸包名（npm）天然不匹配，无需处理。
    files: ['src/modules/**/*.{js,jsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^\\.\\.[\\\\/](?!\\.\\.[\\\\/])(?!core[\\\\/])(?!web[\\\\/]frontend[\\\\/])',
              message: '模块之间不得互相依赖；共享逻辑请下沉到 core/。',
            },
            {
              regex: '^\\.\\.[\\\\/]\\.\\.[\\\\/](?!core[\\\\/])(?!web[\\\\/]frontend[\\\\/])',
              message: '模块之间不得互相依赖；共享逻辑请下沉到 core/。',
            },
          ],
        },
      ],
    },
  },

  {
    // 前端：这条规则的价值最高——把 Node 侧代码 import 进视图，
    // Vite 会把 node: 内置模块一起打进浏览器包，构建期报错或运行期炸掉。
    files: ['src/web/frontend/**/*.{js,jsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*'],
              message: '前端不能引用 Node 内置模块。',
            },
            {
              group: ['**/modules/*/index.js', '**/modules/*/service.js', '**/runtime/**', '**/core/**'],
              message:
                '前端只能 import 模块的 view.jsx。index.js/service.js/runtime/core 是 Node 侧代码，拖进浏览器包会把 node: 内置模块一起带进来。',
            },
          ],
        },
      ],
    },
  },

  // ---- 生成器专属区域：tools/ 要读模板树、写目标目录、spawn 进程 ----
  { files: ['tools/**/*.{js,mjs}'], rules: { 'no-restricted-imports': 'off' } },
]);
