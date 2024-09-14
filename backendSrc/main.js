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

const __dirname = dirname(fileURLToPath(import.meta.url))
Helper.init(app.getAppPath(), join(__dirname, '../'))
Scraper.load()

//electron加载
app.enableSandbox()
app.whenReady().then(() => {
    createWindow()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow()
        }
    })
})

app.on('window-all-closed', () => {if (process.platform !== 'darwin') {app.quit()}})

Helper.logging.log('程序初始化完成...')