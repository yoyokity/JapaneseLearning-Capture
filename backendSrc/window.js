import { BrowserWindow } from 'electron/main'
import { Helper } from '../yo-electron-lib/Helper/helper.js'

export function createWindow () {
    const mainWindow = new BrowserWindow({
        width: 950,
        height: 600,
        minWidth: 930,
        minHeight: 500,
        frame: false,
        titleBarStyle: 'hidden',
        webPreferences: {
            preload: Helper.path.dataDir.join('yo-electron-lib/webSocket/preload.cjs').str,
        },
    })

    if (process.env.SERVER === 'on') {
        console.info('electron前端连接到 http://localhost:5173/')
        mainWindow.webContents.openDevTools()
        mainWindow.loadURL('http://localhost:5173/')
    } else {
        console.info('electron前端使用 ./guiSrc/dist/index.html')
        mainWindow.loadFile('./guiSrc/dist/index.html')
    }

    yoyoNode.window = {
        mainWindow: mainWindow
    }
}