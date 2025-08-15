import { BrowserWindow, shell } from 'electron'
import ElectronStore from 'electron-store'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

export function createWindow(): void {
	// 保存窗口配置
	const store = new ElectronStore({
		name: 'window', // 保存到data/window.json
		defaults: {
			window: {
				width: 950,
				height: 600,
				x: undefined,
				y: undefined
			}
		}
	})

	const config = {
		// 获取窗口配置
		getWindowConfig() {
			return store.get('window')
		},

		// 保存窗口配置
		saveWindowConfig(width: number, height: number, x?: number, y?: number) {
			store.set('window', {
				width,
				height,
				x,
				y
			})
		}
	}

	// 获取保存的窗口配置
	const windowConfig = config.getWindowConfig()

	const mainWindow = new BrowserWindow({
		width: windowConfig.width,
		height: windowConfig.height,
		x: windowConfig.x,
		y: windowConfig.y,

		minWidth: 670,
		minHeight: 500,
		...(process.platform === 'linux' ? { icon } : {}),
		webPreferences: {
			preload: join(__dirname, '../preload/index.mjs'),
			sandbox: false,
			webSecurity: true // web安全性
		}
	})
	mainWindow.menuBarVisible = false // 隐藏菜单栏

	mainWindow.on('ready-to-show', () => {
		mainWindow.show()
	})

	// 用默认浏览器打开外部链接
	mainWindow.webContents.setWindowOpenHandler((details) => {
		shell.openExternal(details.url)
		return { action: 'deny' }
	})

	// 监听窗口关闭事件，保存窗口大小和位置
	mainWindow.on('close', () => {
		const { width, height } = mainWindow.getBounds()
		const { x, y } = mainWindow.getBounds()
		config.saveWindowConfig(width, height, x, y)
	})

	// 基于 electron-vite 脚手架的渲染进程热模块替换 (HMR)。
	// 开发环境下加载远程 URL，生产环境下加载本地 HTML 文件。
	if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
		mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
		//开发环境中自动打开DevTools
		mainWindow.webContents.openDevTools({ mode: 'undocked' })
	} else {
		mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
		// 注册F12快捷键，在生产环境打开DevTools
		mainWindow.webContents.on('before-input-event', (_, input) => {
			if (input.key === 'F12') {
				if (mainWindow.webContents.isDevToolsOpened()) {
					mainWindow.webContents.closeDevTools()
				} else {
					mainWindow.webContents.openDevTools({ mode: 'undocked' })
				}
			}
		})
	}
}
