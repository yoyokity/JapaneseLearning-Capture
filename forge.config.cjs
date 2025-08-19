module.exports = {
	packagerConfig: {
		name: 'JapLC',
		appCopyright: 'Copyright © 2080 yoyokity',
		icon: 'build/icons/icon.ico',
		overwrite: true,
		asar: false, // 不使用asar
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
			'README.md',
			'tsconfig.json',
			'tsconfig.node.json',
			'tsconfig.web.json'
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
