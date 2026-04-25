import { app, ipcMain } from 'electron'

export const appPath = {
    root: '',
    arsr: '',
    resources: '',
    extraResource: '',
    renderer: ''
}

// 返回app的工作路径
ipcMain.handle('filesystem:appPath', () => appPath.root)

// 返回app的arsr路径
ipcMain.handle('filesystem:arsrPath', () => {
    return {
        root: appPath.arsr,
        resources: appPath.resources,
        extraResource: appPath.extraResource,
        renderer: appPath.renderer
    }
})

// 返回userData路径
ipcMain.handle('filesystem:userPath', () => app.getPath('userData'))

// 返回logs路径
ipcMain.handle('filesystem:logsPath', () => app.getPath('logs'))

// 返回temp路径
ipcMain.handle('filesystem:tempPath', () => app.getPath('temp'))
