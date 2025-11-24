import antfu from '@antfu/eslint-config'
import importX from 'eslint-plugin-import-x'

export default antfu(
    {
        typescript: true,
        vue: true, // 明确启用 Vue 支持
        stylistic: false // 禁用代码格式化规则
    },
    {
        plugins: {
            'import-x': importX
        },
        rules: {
            'ts/ban-ts-comment': 'off', // 允许使用 @ts-ignore
            'node/prefer-global/process': 'off', // 允许使用全局 process
            'no-console': 'off', // 允许使用 console
            'vue/html-indent': 'off', // Vue HTML 模板交给 Prettier 处理
            'vue/html-closing-bracket-newline': 'off', // 允许闭合标签前换行

            // Import 路径优化 - 自动移除不必要的 /index.ts
            'import-x/no-useless-path-segments': [
                'error',
                {
                    noUselessIndex: true // 移除路径中的 /index
                }
            ],

            // Import 排序规则 - 使用 @antfu/eslint-config 内置的 import-x 插件
            'sort-imports': 'off', // 关闭 ESLint 内置的排序
            'import-x/order': [
                'error',
                {
                    // 导入分组顺序
                    groups: [
                        'type', // 类型导入
                        ['builtin', 'external'], // Node.js 内置模块、外部依赖
                        ['internal', 'parent', 'sibling'], // 内部模块、父级和同级目录
                        ['index', 'object'] // index 文件、object imports
                    ],
                    // 不同组之间添加空行
                    'newlines-between': 'always',
                    // 内部模块路径匹配规则
                    pathGroups: [
                        {
                            pattern: '@/**',
                            group: 'internal',
                            position: 'before'
                        }
                    ],
                    pathGroupsExcludedImportTypes: ['type']
                }
            ]
        }
    }
)
