import { join } from 'node:path'
import { electronApp } from '@electron-toolkit/utils'
import { app, BrowserWindow, net, protocol } from 'electron'

import { registerCloudflareIpc } from './CloudflareWindow'
import { appPath } from './ipc'
import { createWindow } from './window'

// 设置app路径
appPath.root = process.cwd()
appPath.arsr = app.getAppPath()
appPath.resources = join(appPath.arsr, 'resources')
appPath.extraResource = app.isPackaged ? join(appPath.arsr, '../') : appPath.arsr
appPath.renderer = join(appPath.arsr, 'dist', 'renderer')

// 设置electron缓存文件夹在根目录下，不要建立在C盘
app.setPath('userData', join(appPath.root, 'data'))
app.setPath('logs', join(appPath.root, 'data', 'logs'))
app.setPath('temp', join(appPath.root, 'data', 'temp'))

app.whenReady().then(() => {
    // 为 Windows 设置应用用户模型 ID。这是一个专门针对 Windows 的唯一标识符。
    electronApp.setAppUserModelId('com.yoyokity.japLC')

    // 注册 Cloudflare 验证 IPC
    registerCloudflareIpc()

    app.on('activate', () => {
        // 在 macOS 上，当点击 dock 图标并且没有其他窗口打开时，通常会在应用程序中重新创建一个窗口。
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })

    // 注册一个名为 'local-file' 的协议
    protocol.handle('local-file', (request) => {
        const url = decodeURI(request.url.replace(/^local-file:\/\//, ''))
        return net.fetch(`file://${url}`)
    })

    createWindow()
})

// 当所有窗口关闭时退出应用，但在 macOS 上除外。在 macOS 上，
// 应用程序及其菜单栏通常会保持活动状态，直到用户使用 Cmd + Q 显式退出。
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})
