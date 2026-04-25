import * as fs from 'node:fs'
import { join } from 'node:path'
import { electronApp } from '@electron-toolkit/utils'
import { app, BrowserWindow, net, protocol } from 'electron'

import { registerCloudflareIpc } from './CloudflareWindow'
import { appPath } from './ipc'
import { createDirectory } from './ipc/filesystem'
import { createWindow } from './window'

// 预注册本地文件协议，确保渲染进程可识别
protocol.registerSchemesAsPrivileged([
    {
        scheme: 'local-file',
        privileges: {
            standard: true,
            secure: true,
            supportFetchAPI: true,
            corsEnabled: true
        }
    }
])

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

createDirectory(app.getPath('temp'))

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
        const requestUrl = new URL(request.url)
        const pathname = decodeURIComponent(requestUrl.pathname)
        const normalizedPath = requestUrl.host
            ? `${requestUrl.host.toUpperCase()}:${pathname}`
            : pathname.replace(/^\/(?<drive>[A-Z]:\/)/i, '$<drive>')
        const encodedPath = normalizedPath
            .replace(/\\/g, '/')
            .split('/')
            .map((item, index) => {
                if (index === 0 && /^[A-Z]:$/i.test(item)) {
                    return item
                }
                return encodeURIComponent(item)
            })
            .join('/')

        return net.fetch(`file:///${encodedPath}`)
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

// 程序退出时清理 temp 文件夹
app.on('will-quit', () => {
    fs.rmSync(app.getPath('temp'), { recursive: true, force: true })
})
