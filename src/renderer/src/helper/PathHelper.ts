import { Ipc } from '@renderer/ipc'
import * as pathe from 'pathe'

import { LogHelper } from './LogHelper.ts'
import { TaskHelper } from './TaskHelper.ts'

export class Path {
    readonly _path: string

    constructor(...paths: string[]) {
        this._path = pathe.resolve(...paths)
    }

    /**
     * 文件名，如果为目录则返回最后一级目录
     */
    get filename() {
        return pathe.basename(this._path)
    }

    /**
     * 文件扩展名，如果为目录则返回''
     */
    get extname() {
        return pathe.extname(this._path)
    }

    /**
     * 不带扩展名的文件名，如果为目录则返回最后一级目录
     */
    get basename() {
        return pathe.basename(this._path, this.extname)
    }

    /**
     * 上级目录
     */
    get parent() {
        return new Path(pathe.dirname(this._path))
    }

    /**
     * 是否为绝对路径
     */
    get isAbsolute() {
        // 在Windows系统中，以/开头的路径会被path.isAbsolute错误地判定为绝对路径
        // 这里进行特殊处理，确保在Windows系统下，只有包含盘符的路径才被判定为绝对路径
        if (
            navigator.userAgent.includes('Windows') &&
            (this._path.startsWith('/') || this._path.startsWith('\\'))
        ) {
            return false
        }

        return pathe.isAbsolute(this._path)
    }

    toString() {
        return this._path
    }

    /**
     * 路径拼接
     */
    join(...paths: string[]) {
        return new Path(pathe.join(this._path, ...paths))
    }

    /**
     * 判断path是否存在于磁盘上
     * @remarks 用时 <10ms
     */
    async isExist() {
        const re = await TaskHelper.tryExecute(Ipc.filesystem.isExist, this._path)
        if (!re.hasError) {
            return re.result
        } else {
            LogHelper.error(`判断path是否存在失败：`, re.error)
            return false
        }
    }
    /**
     * 判断path是否为目录
     * @remarks 用时 <10ms
     */
    async isDirectory() {
        const re = await TaskHelper.tryExecute(Ipc.filesystem.isDirectory, this._path)
        if (!re.hasError) {
            return re.result
        } else {
            LogHelper.error(`判断path是否为目录失败：`, re.error)
            return false
        }
    }

    /**
     * 判断path是否为文件
     * @remarks 用时 <10ms
     */
    async isFile() {
        const re = await TaskHelper.tryExecute(Ipc.filesystem.isFile, this._path)
        if (!re.hasError) {
            return re.result
        } else {
            LogHelper.error(`判断path是否为文件失败：`, re.error)
            return false
        }
    }

    /**
     * 获取path的状态信息
     * @remarks 用时 <10ms
     */
    async getSats() {
        const re = await TaskHelper.tryExecute(Ipc.filesystem.getSatus, this._path)
        if (!re.hasError) {
            return re.result
        } else {
            LogHelper.error(`获取path的状态信息失败：`, re.error)
            return null
        }
    }
}

/**
 * 路径、文件相关
 */
export class PathHelper {
    /**
     * 返回app的工作目录，正常情况下就是exe所在的目录
     */
    static appPath: Path
    /**
     * 返回arsr所在的路径
     */
    static arsrPath: IArsrPath
    /**
     * 返回userData路径，用于存储用户数据
     */
    static userPath: Path
    /**
     * 返回logs路径，用于记录日志
     */
    static logsPath: Path
    /**
     * 返回temp路径，用于记录临时文件，关闭程序时自动删除
     */
    static tempPath: Path

    static async init() {
        const appPath = await TaskHelper.tryExecute(Ipc.app.appPath)
        if (!appPath.hasError) {
            LogHelper.debug(`获取appPath成功：`, appPath.result)
            PathHelper.appPath = new Path(appPath.result)
        } else {
            LogHelper.error(`获取appPath失败：`, appPath.error)
        }

        const arsrPath = await TaskHelper.tryExecute(Ipc.app.arsrPath)
        if (!arsrPath.hasError) {
            LogHelper.debug(`获取arsrPath成功：`, arsrPath.result.root)
            LogHelper.debug(`获取resources成功：`, arsrPath.result.resources)
            LogHelper.debug(`获取extraResource成功：`, arsrPath.result.extraResource)
            LogHelper.debug(`获取renderer成功：`, arsrPath.result.renderer)
            PathHelper.arsrPath = {
                root: new Path(arsrPath.result.root),
                resources: new Path(arsrPath.result.resources),
                extraResource: new Path(arsrPath.result.extraResource),
                renderer: new Path(arsrPath.result.renderer)
            }
        } else {
            LogHelper.error(`获取arsrPath失败：`, arsrPath.error)
        }

        const userDataPath = await TaskHelper.tryExecute(Ipc.app.userPath)
        if (!userDataPath.hasError) {
            LogHelper.debug(`获取userDataPath成功：`, userDataPath.result)
            PathHelper.userPath = new Path(userDataPath.result)
        } else {
            LogHelper.error(`获取userDataPath失败：`, userDataPath.error)
        }

        const logsPath = await TaskHelper.tryExecute(Ipc.app.logsPath)
        if (!logsPath.hasError) {
            LogHelper.debug(`获取logsPath成功：`, logsPath.result)
            PathHelper.logsPath = new Path(logsPath.result)
        } else {
            LogHelper.error(`获取logsPath失败：`, logsPath.error)
        }

        const tempPath = await TaskHelper.tryExecute(Ipc.app.tempPath)
        if (!tempPath.hasError) {
            LogHelper.debug(`获取tempPath成功：`, tempPath.result)
            PathHelper.tempPath = new Path(tempPath.result)
        } else {
            LogHelper.error(`获取tempPath失败：`, tempPath.error)
        }
    }

    /**
     * 创建一个Path路径
     */
    static newPath(...paths: string[]) {
        return new Path(...paths)
    }

    /**
     * 替换掉路径中的非法字符
     */
    static sanitizePath(path: Path | string): Path {
        if (typeof path === 'string') path = new Path(path)

        const fullWidthMap = {
            '?': '？',
            '"': '＂',
            '<': '＜',
            '>': '＞',
            '|': '｜'
        }

        // 1. 替换非法字符为全角符号
        const sanitized = path.toString().replace(/[?"<>|]/g, (char) => {
            return fullWidthMap[char as keyof typeof fullWidthMap] || ''
        })

        // 2. 移除开头和结尾的非法字符（如空格、点）
        return new Path(sanitized.replace(/[.\s]+$/, ''))
    }

    /**
     * 递归创建目录
     * @description 如果目录已存在则跳过，最终根据目录是否存在（包括创建完成后）来返回boolean
     * @remarks 用时 <10ms
     * @param path 要创建的目录路径
     * @returns 目录是否存在或创建成功
     */
    static async createDirectory(path: Path | string): Promise<boolean> {
        const re = await TaskHelper.tryExecute(Ipc.filesystem.createDirectory, path.toString())
        if (!re.hasError) {
            return re.result
        } else {
            LogHelper.error(`创建目录失败：`, re.error)
            return false
        }
    }

    /**
     * 使用fast-glob搜索文件和目录
     * @remarks 用时与文件数量相关，在5-100ms左右，正常10ms上下
     * @description 由于ipc原因，不提供stats选项，需要获取文件状态请使用getSatus
     * @param path 搜索的路径
     * @param [type] 搜索的类型
     * @param [filter] 搜索通配符
     * @param ignore 忽略的通配符
     * @param deep 搜索深度，undefined为无限，1为仅当前目录
     */
    static async readDirectory(
        path: Path | string,
        type: 'file' | 'directory' | 'all' = 'all',
        filter: string | string[] = '**/*',
        ignore?: string[],
        deep?: number
    ): Promise<string[]> {
        // 如果path为相对路径，则转换为appPath的绝对路径
        if (typeof path === 'string') path = new Path(path)
        if (!(await path.isAbsolute)) {
            path = PathHelper.appPath.join(path.toString())
        }

        const re = await TaskHelper.tryExecute(Ipc.filesystem.readDirectory, filter, {
            cwd: path.toString(),
            deep,
            onlyFiles: type === 'file' ? true : undefined,
            onlyDirectories: type === 'directory' ? true : undefined,
            ignore
        })
        if (!re.hasError) {
            return re.result
        } else {
            LogHelper.error(`读取目录失败：`, re.error)
            return []
        }
    }

    /**
     * 删除文件或目录
     * @remarks 用时 <10ms
     * @returns 目标是否已不存在
     */
    static async remove(path: Path | string): Promise<boolean> {
        const re = await TaskHelper.tryExecute(Ipc.filesystem.remove, path.toString())
        if (!re.hasError) {
            return true
        } else {
            LogHelper.error(`删除文件或目录失败：`, re.error)
            return false
        }
    }

    /**
     * 写入文件（如果目录不存在自动则创建）
     * @remarks 用时 <10ms
     * @param path 文件路径
     * @param data 要写入的数据
     */
    static async writeFile(path: Path | string, data: string | ArrayBufferView): Promise<boolean> {
        const re = await TaskHelper.tryExecute(Ipc.filesystem.writeFile, path.toString(), data)
        if (!re.hasError) {
            return true
        } else {
            LogHelper.error(`写入文件失败：`, re.error)
            return false
        }
    }

    /**
     * 追加内容到文件（如果文件不存在则自动创建）
     * @remarks 用时 <10ms
     * @param path 文件路径
     * @param data 要追加的数据
     */
    static async appendFile(path: Path | string, data: string | Uint8Array): Promise<boolean> {
        const re = await TaskHelper.tryExecute(Ipc.filesystem.appendFile, path.toString(), data)
        if (!re.hasError) {
            return true
        } else {
            LogHelper.error(`追加文件内容失败：`, re.error)
            return false
        }
    }

    /**
     * 读取文件内容
     * @remarks 用时 <10ms
     * @param path 文件路径
     * @param [encoding] 文件编码
     */
    static async readFile(
        path: Path | string,
        encoding: BufferEncoding | 'arraybuffer' = 'utf-8'
    ): Promise<string | ArrayBuffer | null> {
        const re = await TaskHelper.tryExecute(Ipc.filesystem.readFile, path.toString(), encoding)
        if (!re.hasError) {
            return re.result
        } else {
            LogHelper.error(`读取文件失败：`, re.error)
            return null
        }
    }

    /**
     * 复制文件或目录
     * @remarks 用时与文件大小和数量相关
     * @param sourcePath 源文件或目录路径
     * @param destPath 目标路径
     * @param overwrite 是否覆盖已存在的文件或目录，默认为true
     * @param filter 过滤函数，返回true表示复制该文件，false表示跳过
     */
    static async copy(
        sourcePath: Path | string,
        destPath: Path | string,
        overwrite: boolean = true,
        filter?: (src: string, dest: string) => boolean
    ): Promise<boolean> {
        const re = await TaskHelper.tryExecute(
            Ipc.filesystem.copy,
            sourcePath.toString(),
            destPath.toString(),
            overwrite,
            filter
        )
        if (!re.hasError) {
            return true
        } else {
            LogHelper.error(`复制文件或目录失败：`, re.error)
            return false
        }
    }

    /**
     * 移动文件或目录（也可以重命名）
     * @remarks 用时与文件大小和数量相关
     * @param sourcePath 源文件或目录路径
     * @param destPath 目标路径
     * @param overwrite 是否覆盖已存在的文件或目录，默认为true
     */
    static async move(
        sourcePath: Path | string,
        destPath: Path | string,
        overwrite: boolean = true
    ): Promise<boolean> {
        const re = await TaskHelper.tryExecute(
            Ipc.filesystem.move,
            sourcePath.toString(),
            destPath.toString(),
            overwrite
        )
        if (!re.hasError) {
            return true
        } else {
            LogHelper.error(`移动文件或目录失败：`, re.error)
            return false
        }
    }

    /**
     * 在资源管理器中打开路径
     * @remarks 用时 <10ms
     * @param path 要打开的路径
     */
    static async openInExplorer(path: Path | string) {
        const re = await TaskHelper.tryExecute(Ipc.filesystem.openInExplorer, path.toString())
        if (!re.hasError) {
            return true
        } else {
            LogHelper.error(`在资源管理器中打开路径失败：`, re.error)
            return false
        }
    }

    /**
     * 获取前端文件的实际绝对路径
     * @remarks 用时 <10ms
     * @param file 文件
     * @returns 文件路径
     */
    static async getPathForFile(file: File): Promise<string | null> {
        const re = await TaskHelper.tryExecute(Ipc.filesystem.getPathForFile, file)
        if (!re.hasError) {
            return re.result
        } else {
            LogHelper.error(`获取前端文件的实际绝对路径失败：`, re.error)
            return null
        }
    }

    /**
     * 删除空文件夹
     * @remarks 用时 <10ms
     * @param rootPath 根路径
     */
    static async removeEmptyFolders(rootPath: Path | string) {
        LogHelper.debug(`检查路径内是否有无视频的文件夹：`, rootPath.toString())
        const re = await TaskHelper.tryExecute(
            Ipc.filesystem.removeEmptyFolders,
            rootPath.toString()
        )
        if (!re.hasError) {
            return true
        } else {
            LogHelper.error(`删除空文件夹失败：`, re.error)
            return false
        }
    }

    /**
     * 清空文件夹（删除文件夹内所有内容，保留文件夹本身）
     * @remarks 用时与文件数量相关
     * @param folderPath 要清空的文件夹路径
     * @returns 是否成功清空
     */
    static async clearFolder(folderPath: Path | string): Promise<boolean> {
        LogHelper.success(`清空文件夹：`, folderPath.toString())
        const re = await TaskHelper.tryExecute(Ipc.filesystem.clearFolder, folderPath.toString())
        if (!re.hasError) {
            return re.result
        } else {
            LogHelper.error(`清空文件夹失败：`, re.error)
            return false
        }
    }
}
export interface IArsrPath {
    /**
     * arsr根目录
     */
    root: Path
    /**
     * arsr资源目录
     */
    resources: Path
    /**
     * arsr的父目录，包含了arsr以及其他extraResource资源
     */
    extraResource: Path
    /**
     * 前端web代码根目录
     */
    renderer: Path
}
