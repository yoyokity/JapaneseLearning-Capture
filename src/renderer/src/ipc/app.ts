/**
 * app自身相关
 */
export const app = {
    /**
     * 返回app的工作目录，正常情况下就是exe所在的目录
     */
    appPath: (): Promise<string> => window.electron.ipcRenderer.invoke('filesystem:appPath'),

    /**
     * 返回arsr所在的路径
     */
    arsrPath: (): Promise<ArsrPathString> =>
        window.electron.ipcRenderer.invoke('filesystem:arsrPath'),

    /**
     * 返回userData路径，用于存储用户数据
     */
    userPath: (): Promise<string> => window.electron.ipcRenderer.invoke('filesystem:userPath'),

    /**
     * 返回logs路径，用于记录日志
     */
    logsPath: (): Promise<string> => window.electron.ipcRenderer.invoke('filesystem:logsPath'),

    /**
     * 返回temp路径，用于记录临时文件，关闭程序时自动删除
     */
    tempPath: (): Promise<string> => window.electron.ipcRenderer.invoke('filesystem:tempPath')
}

export interface ArsrPathString {
    /**
     * arsr根目录
     */
    root: string
    /**
     * arsr资源目录
     */
    resources: string
    /**
     * arsr的父目录，包含了arsr以及其他extraResource资源
     */
    extraResource: string
    /**
     * 前端web代码根目录
     */
    renderer: string
}
