const { execFileSync } = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { path7za } = require('7zip-bin')

/**
 * 目录 hash 取前 8 位
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
        // 打包后改名并压缩
        postPackage: async (_forgeConfig, options) => {
            for (const [index, outputPath] of options.outputPaths.entries()) {
                const outDir = path.dirname(outputPath)
                const target = path.join(outDir, 'JapLC')
                await fs.promises.rm(target, { recursive: true, force: true })
                await fs.promises.rename(outputPath, target)
                options.outputPaths[index] = target

                // 解压器放 resources
                const resourcesDir = path.join(target, 'resources')
                await fs.promises.copyFile(path7za, path.join(resourcesDir, '7za.exe'))

                for (const name of await fs.promises.readdir(outDir)) {
                    if (
                        name === 'JapLC-x64.7z' ||
                        name === 'JapLC-app-x64.7z' ||
                        (name.startsWith('JapLC-dep-') && name.endsWith('.7z')) ||
                        (name.startsWith('JapLC-tools-') && name.endsWith('.7z'))
                    ) {
                        await fs.promises.rm(path.join(outDir, name), { force: true })
                    }
                }

                // 主程序包
                execFileSync(path7za, ['a', '-mx=5', '-md=32m', 'JapLC-app-x64.7z', 'JapLC'], {
                    cwd: outDir,
                    stdio: 'inherit'
                })

                // 各依赖单独打包
                const toolsDir = path.join(__dirname, 'tools')
                for (const id of await fs.promises.readdir(toolsDir)) {
                    // 跳过隐藏项
                    if (id.startsWith('.')) continue

                    const dependencyDir = path.join(toolsDir, id)
                    if (!(await fs.promises.stat(dependencyDir)).isDirectory()) continue

                    const hash = hashDirectory(dependencyDir)
                    const archiveName = `JapLC-dep-${id}-${hash}-x64.7z`
                    execFileSync(
                        path7za,
                        ['a', '-mx=5', '-md=32m', path.join(outDir, archiveName), id],
                        { cwd: toolsDir, stdio: 'inherit' }
                    )
                }
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
