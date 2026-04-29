import { trpcClient } from '@renderer/ipc/func.ts'

/**
 * arsr 路径信息
 */
export interface IArsrPathString {
    /**
     * arsr 根目录
     */
    root: string
    /**
     * arsr 资源目录
     */
    resources: string
    /**
     * arsr 的父目录，包含了 arsr 以及其他 extraResource 资源
     */
    extraResource: string
    /**
     * 前端 web 代码根目录
     */
    renderer: string
}

/**
 * app自身相关
 */
export const app = {
    /**
     * 返回app的工作目录，正常情况下就是exe所在的目录
     */
    appPath: (): Promise<string> => trpcClient.app.appPath.query(),

    /**
     * 返回arsr所在的路径
     */
    arsrPath: (): Promise<IArsrPathString> => trpcClient.app.arsrPath.query(),

    /**
     * 返回userData路径，用于存储用户数据
     */
    userPath: (): Promise<string> => trpcClient.app.userPath.query(),

    /**
     * 返回logs路径，用于记录日志
     */
    logsPath: (): Promise<string> => trpcClient.app.logsPath.query(),

    /**
     * 返回temp路径，用于记录临时文件，关闭程序时自动删除
     */
    tempPath: (): Promise<string> => trpcClient.app.tempPath.query()
}
