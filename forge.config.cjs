const { execFileSync } = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { path7za } = require('7zip-bin')

/** 统一工具包包含的目录 */
const TOOLS_PACKAGE_IDS = ['ffmpeg', 'image-polish', 'mediainfo']

/**
 * 目录 hash 取前 8 位
 * @param {string} dirPath 目录路径
 * @remark 模型文件可能接近 2GB，必须流式读取，不能一次性读入内存
 */
async function hashDirectory(dirPath) {
    const hash = crypto.createHash('sha256')

    const walk = async (currentPath) => {
        for (const name of fs.readdirSync(currentPath).sort()) {
            const fullPath = path.join(currentPath, name)
            const stat = fs.statSync(fullPath)
            if (stat.isDirectory()) {
                await walk(fullPath)
            } else if (name !== '.version') {
                hash.update(path.relative(dirPath, fullPath))
                await new Promise((resolve, reject) => {
                    const stream = fs.createReadStream(fullPath)
                    stream.on('data', (chunk) => hash.update(chunk))
                    stream.on('end', resolve)
                    stream.on('error', reject)
                })
            }
        }
    }

    await walk(dirPath)
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
            // 根目录的源码、构建产物与开发目录
            /^\/(?:src|build|data|tools|image-polish|scripts|test|\.vite-hooks|\.zcode|\.cursor|\.git|\.vscode|\.windsurf|\.idea|\.VSCodeCounter)(\/|$)/,
            // 根目录的工程配置与说明
            /^\/(?:\.gitignore|\.npmrc|\.prettierignore|\.prettierrc\.yaml|pnpm-lock\.yaml|forge\.config\.cjs|release\.mjs|electron\.vite\.config\.(?:js|ts)|vite\.config\.ts|README\.md|AGENTS\.md|tsconfig[^/]*|eslint\.config\.js|pnpm-workspace\.yaml|postcss\.config\.ts)$/,
            // node_modules 只保留运行时需要的 sharp 及其依赖
            /^\/node_modules\/(?!sharp(\/|$)|@img(\/|$)|detect-libc(\/|$)|semver(\/|$))/
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

                // 统一工具包 + 官网直下依赖的版本
                const toolsDir = path.join(__dirname, 'tools')
                const hashes = {}
                for (const id of TOOLS_PACKAGE_IDS) {
                    hashes[id] = await hashDirectory(path.join(toolsDir, id))
                }
                const toolsHash = crypto
                    .createHash('sha256')
                    .update(TOOLS_PACKAGE_IDS.map((id) => `${id}:${hashes[id]}`).join('|'))
                    .digest('hex')
                    .slice(0, 8)

                const subtitleDir = path.join(toolsDir, 'subtitle')
                if (
                    !fs.existsSync(
                        path.join(subtitleDir, 'runtimes/windows-x64/cuda/bin/crispasr.exe')
                    )
                ) {
                    throw new Error('未找到 tools/subtitle，请先执行 vp install 下载字幕依赖')
                }
                const subtitleHash = await hashDirectory(subtitleDir)

                execFileSync(
                    path7za,
                    [
                        'a',
                        '-mx=5',
                        '-md=32m',
                        path.join(outDir, `JapLC-tools-${toolsHash}-x64.7z`),
                        ...TOOLS_PACKAGE_IDS
                    ],
                    { cwd: toolsDir, stdio: 'inherit' }
                )
                await fs.promises.writeFile(
                    path.join(outDir, 'dependency-hashes.json'),
                    JSON.stringify({ tools: toolsHash, subtitle: subtitleHash }, null, 4)
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
