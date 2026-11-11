const { execFileSync } = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { path7za } = require('7zip-bin')

/**
 * 递归计算目录内容 hash，取前 8 位作为 tools 版本
 * @param {string} dirPath 目录路径
 */
function hashDirectory(dirPath) {
    const hash = crypto.createHash('sha256')

    const walk = (currentPath) => {
        for (const name of fs.readdirSync(currentPath).sort()) {
            const fullPath = path.join(currentPath, name)
            const stat = fs.statSync(fullPath)
            if (stat.isDirectory()) {
                walk(fullPath)
            } else if (name !== '.version') {
                hash.update(path.relative(dirPath, fullPath))
                hash.update(fs.readFileSync(fullPath))
            }
        }
    }

    walk(dirPath)
    return hash.digest('hex').slice(0, 8)
}

module.exports = {
    packagerConfig: {
        name: 'JapLC',
        appCopyright: 'Copyright © 2080 yoyokity',
        icon: 'build/icons/icon.ico',
        overwrite: true,
        asar: {
            unpack: '{**/node_modules/@img/**,**/node_modules/sharp/**}'
        },
        win32metadata: {
            ProductName: 'Japanese Learning Capture'
        },
        extraResource: ['tools'],
        ignore: [
            /^\/src/,
            /^\/build/,
            '.zcode',
            '.cursor',
            '.git',
            '.vscode',
            '.windsurf',
            '.idea',
            'data',
            'tools',
            'image-polish',

            '.gitignore',
            '.npmrc',
            '.prettierignore',
            '.prettierrc.yaml',
            'pnpm-lock.yaml',
            'forge.config.cjs',
            'release.mjs',
            'electron.vite.config.js',
            'electron.vite.config.ts',
            'README.md',
            'AGENTS.md',
            'tsconfig.json',
            'tsconfig.node.json',
            'tsconfig.web.json',
            '.VSCodeCounter',
            'eslint.config.js',
            'pnpm-workspace.yaml',
            'postcss.config.ts',
            'tsconfig.web.tsbuildinfo'
        ]
    },
    rebuildConfig: {},
    hooks: {
        // 打包完成后改名、写入更新元信息，并压缩为全量/主程序/tools 三个包
        postPackage: async (_forgeConfig, options) => {
            for (const [index, outputPath] of options.outputPaths.entries()) {
                const outDir = path.dirname(outputPath)
                const target = path.join(outDir, 'JapLC')
                await fs.promises.rm(target, { recursive: true, force: true })
                await fs.promises.rename(outputPath, target)
                options.outputPaths[index] = target

                // 解压器放在 resources 根，避免被 tools 更新包覆盖
                const resourcesDir = path.join(target, 'resources')
                await fs.promises.copyFile(path7za, path.join(resourcesDir, '7za.exe'))
                // 同时输出到 out 根，供发布时作为独立资产上传（旧版本升级首次需要）
                await fs.promises.copyFile(path7za, path.join(outDir, '7za.exe'))

                // 写入 tools 版本标记，更新时与 release 资产名中的 hash 比对，未变化则跳过下载
                const toolsDir = path.join(resourcesDir, 'tools')
                const toolsHash = hashDirectory(toolsDir)
                await fs.promises.writeFile(path.join(toolsDir, '.version'), toolsHash)

                const toolsArchiveName = `JapLC-tools-${toolsHash}-x64.7z`
                for (const name of await fs.promises.readdir(outDir)) {
                    if (
                        name === 'JapLC-x64.7z' ||
                        name === 'JapLC-app-x64.7z' ||
                        (name.startsWith('JapLC-tools-') && name.endsWith('.7z'))
                    ) {
                        await fs.promises.rm(path.join(outDir, name), { force: true })
                    }
                }

                const archiveOptions = { cwd: outDir, stdio: 'inherit' }
                // 全量包，供新用户首次安装
                execFileSync(
                    path7za,
                    ['a', '-mx=5', '-md=32m', 'JapLC-x64.7z', 'JapLC'],
                    archiveOptions
                )
                // 主程序包，排除 tools
                execFileSync(
                    path7za,
                    [
                        'a',
                        '-mx=5',
                        '-md=32m',
                        'JapLC-app-x64.7z',
                        'JapLC',
                        '-x!JapLC\\resources\\tools'
                    ],
                    archiveOptions
                )
                // tools 包，仅在 hash 变化时下载
                execFileSync(
                    path7za,
                    ['a', '-mx=5', '-md=32m', toolsArchiveName, 'JapLC\\resources\\tools'],
                    archiveOptions
                )
            }
        }
    },
    makers: [
        {
            name: '@electron-forge/maker-squirrel',
            config: {}
        },
        {
            name: '@electron-forge/maker-zip',
            platforms: ['darwin']
        },
        {
            name: '@electron-forge/maker-deb',
            config: {}
        },
        {
            name: '@electron-forge/maker-rpm',
            config: {}
        }
    ]
}
