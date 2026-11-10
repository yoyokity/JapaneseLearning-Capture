const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { path7za } = require('7zip-bin')

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
        // 打包完成后把 JapLC-win32-x64 改名为 JapLC，并压缩为 JapLC.7z
        postPackage: async (_forgeConfig, options) => {
            for (const [index, outputPath] of options.outputPaths.entries()) {
                const outDir = path.dirname(outputPath)
                const target = path.join(outDir, 'JapLC')
                await fs.promises.rm(target, { recursive: true, force: true })
                await fs.promises.rename(outputPath, target)
                options.outputPaths[index] = target

                await fs.promises.rm(path.join(outDir, 'JapLC-x64.7z'), { force: true })
                execFileSync(path7za, ['a', '-mx=5', '-md=32m', 'JapLC-x64.7z', 'JapLC'], {
                    cwd: outDir,
                    stdio: 'inherit'
                })
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
