import { electronAPI } from '@electron-toolkit/preload'
import { contextBridge, webUtils } from 'electron'

// 为渲染进程提供的自定义API
const api = {
    getPathForFile: (path: File) => webUtils.getPathForFile(path)
}

// 使用`contextBridge` API将Electron API暴露给
// 渲染进程，仅在上下文隔离启用时有效，否则
// 直接添加到DOM全局对象中。
if (process.contextIsolated) {
    try {
        contextBridge.exposeInMainWorld('electron', electronAPI)
        contextBridge.exposeInMainWorld('api', api)
    } catch (error) {
        console.error(error)
    }
} else {
    // @ts-ignore (在dts中定义)
    window.electron = electronAPI
    // @ts-ignore (在dts中定义)
    window.api = api
}
