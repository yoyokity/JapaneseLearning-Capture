import Store from 'electron-store'
import { app, BrowserWindow, ipcMain } from 'electron/main'
import { createWindow } from './window.js'

global.yoyoNode = {}
yoyoNode.app = app
yoyoNode.store = new Store()

//ws
import { wsServer } from './wsApi.js'

wsServer.start()

//Helper初始化
import { Helper } from '../yo-electron-lib/Helper/helper.js'
import { fileURLToPath } from 'url'
import { join, dirname } from 'path'
import { Scraper } from './scraper/Scraper.js'
import { shell } from 'electron'

const __dirname = dirname(fileURLToPath(import.meta.url))
Helper.init(process.cwd(), join(__dirname, '../'))
await Scraper.load()

//electron加载
const gotTheLock = app.requestSingleInstanceLock() //防止重复启动
if (!gotTheLock) {
    app.quit()
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // 如果用户再次启动应用，显示已打开的窗口
        if (yoyoNode.window.mainWindow) {
            if (yoyoNode.window.mainWindow.isMinimized()) yoyoNode.window.mainWindow.restore()
            yoyoNode.window.mainWindow.focus()
        }
    })
}

app.enableSandbox()
app.whenReady().then(() => {
    createWindow()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow()
        }
    })

    //使用默认浏览器打开链接
    app.on('web-contents-created', (e, webContents) => {
        webContents.setWindowOpenHandler(({ url, frameName }) => {
            shell.openExternal(url)
            return { action: 'deny' }
        })
    })
})

app.on('window-all-closed', () => {if (process.platform !== 'darwin') {app.quit()}})

Helper.logging.log('程序初始化完成...')