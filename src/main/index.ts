import * as fs from 'node:fs'
import { join } from 'node:path'
import { electronApp } from '@electron-toolkit/utils'
import { app, BrowserWindow, crashReporter, net, protocol } from 'electron'
import { createIPCHandler } from 'electron-trpc/main'

import { log } from './agent/log'
import { appPath } from './globalStates'
import { appRouter } from './ipc/router'
import { consumeUpdateError, restorePendingUpdate } from './services/update'
import { createDirectory } from './utils/fs'
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
appPath.sandbox = join(appPath.root, 'data', 'sandbox')

// 设置electron缓存文件夹在根目录下，不要建立在C盘
app.setPath('userData', join(appPath.root, 'data'))
app.setPath('logs', join(appPath.root, 'data', 'logs'))
app.setPath('temp', join(appPath.root, 'data', 'temp'))

createDirectory(app.getPath('temp'))
createDirectory(appPath.sandbox)

// 启动崩溃上报（仅本地收集，不上传），否则子进程注册 Crashpad 时会因找不到 handler 报错
crashReporter.start({ uploadToServer: false })

// 读取上次更新失败标记，并恢复已下载完成但未应用的更新
consumeUpdateError()
restorePendingUpdate()

app.whenReady().then(() => {
    // 自定义 preload 已调用 exposeElectronTRPC
    createIPCHandler({ router: appRouter, preload: false })

    // 为 Windows 设置应用用户模型 ID。这是一个专门针对 Windows 的唯一标识符。
    electronApp.setAppUserModelId('com.yoyokity.japLC')

    app.on('activate', () => {
        // 在 macOS 上，当点击 dock 图标并且没有其他窗口打开时，通常会在应用程序中重新创建一个窗口。
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow()
        }
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

// 程序退出时清理 temp 文件夹并关闭 AI 日志数据库
app.on('quit', () => {
    log.close()

    try {
        console.log('清除temp')
        fs.rmSync(app.getPath('temp'), { recursive: true, force: true })
    } catch {}
})
