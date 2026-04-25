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
            '.cursor',
            '.git',
            '.vscode',
            '.windsurf',
            '.idea',
            'data',
            'tools',

            '.gitignore',
            '.npmrc',
            '.prettierignore',
            '.prettierrc.yaml',
            'pnpm-lock.yaml',
            'forge.config.cjs',
            'electron.vite.config.js',
            'electron.vite.config.ts',
            'README.md',
            'tsconfig.json',
            'tsconfig.node.json',
            'tsconfig.web.json',
            '.VSCodeCounter',
            'eslint.config.js',
            'pnpm-workspace.yaml',
            'postcss.config.ts'
        ]
    },
    rebuildConfig: {},
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
