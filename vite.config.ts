import { defineConfig } from 'vite-plus'

export default defineConfig({
    staged: {
        '*': ['eslint --fix', 'prettier --write --experimental-cli']
    },
    run: {
        tasks: {
            // 类型检查
            'lint:check':
                'eslint . && tsc --noEmit -p tsconfig.node.json && vue-tsc --noEmit -p tsconfig.web.json',
            // 修复格式
            'lint:fix': 'eslint . --fix && prettier . --write --experimental-cli',
            // 安全审计（不缓存）
            'audit:check': {
                command: 'pnpm audit --prod',
                cache: false
            },
            // 同步应用图标
            'sync:icon': 'vpx scripts/sync-icon.ts',
            // 生成图标并同步
            'build:icons': {
                command:
                    'electron-icon-builder --input=./resources/mainIcon.png --output=./build -f',
                dependsOn: ['sync:icon']
            },
            // 构建图片处理工具
            'build:image-polish': {
                command: 'python build.py && vpx ../scripts/sync-tools.ts',
                cwd: 'image-polish'
            },
            // 编译产物
            'build:vite': 'electron-vite build --outDir=dist',
            // 完整构建
            build: {
                command: 'vp run build:vite',
                dependsOn: ['build:icons', 'build:image-polish']
            },
            // 启动开发环境
            dev: {
                command: 'cmd /c "chcp 65001 && electron-vite dev --outDir=dist"',
                dependsOn: ['sync:icon', 'build:image-polish'],
                cache: false
            },
            // 预览构建结果
            start: {
                command: 'cmd /c "chcp 65001 && electron-vite preview --outDir=dist"',
                dependsOn: ['sync:icon', 'build:image-polish'],
                cache: false
            },
            // 构建并打包
            package: {
                command: 'electron-forge package',
                dependsOn: ['build'],
                cache: false
            },
            // 发布
            release: {
                command: 'vpx scripts/release.ts',
                cache: false
            }
        }
    }
})
