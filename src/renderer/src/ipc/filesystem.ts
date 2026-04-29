import type {
    IFormatInputPathObject,
    ILogType,
    IStats,
    ReadDirectoryOptions
} from '../../../main/ipc/filesystem.ts'

import { sendTask, trpcClient } from '@renderer/ipc/func.ts'

export type {
    IFormatInputPathObject,
    ILogType,
    IStats,
    ReadDirectoryOptions
} from '../../../main/ipc/filesystem.ts'

/**
 * 文件系统
 */
export const filesystem = {
    /**
     * 判断path是否存在于磁盘上
     * @remarks 用时 <10ms
     */
    isExist: (path: string): Promise<boolean> => trpcClient.filesystem.isExist.query(path),

    /**
     * 判断path是否为文件
     * @remarks 用时 <10ms
     */
    isFile: (path: string): Promise<boolean> => trpcClient.filesystem.isFile.query(path),

    /**
     * 判断path是否为目录
     * @remarks 用时 <10ms
     */
    isDirectory: (path: string): Promise<boolean> => trpcClient.filesystem.isDirectory.query(path),

    /**
     * 获取path状态信息
     * @remarks 用时 <10ms
     */
    getSatus: (path: string): Promise<IStats> => trpcClient.filesystem.getStatus.query(path),

    /**
     * 路径拼接
     * @remarks 用时 <10ms
     */
    join: (...paths: string[]): Promise<string> => trpcClient.filesystem.join.query(paths),

    /**
     * 拼接并解析绝对路径
     * @remarks 用时 <10ms
     */
    resolve: (...paths: string[]): Promise<string> => trpcClient.filesystem.resolve.query(paths),

    /**
     * 获取文件扩展名，如果为目录则返回''
     * @description 包含点号
     * @remarks 用时 <10ms
     * @param path 文件路径
     */
    extname: (path: string): Promise<string> => trpcClient.filesystem.extname.query(path),

    /**
     * 获取路径中的文件名
     * @description 如果path为目录，则返回最后一级目录
     * @remarks 用时 <10ms
     * @param path 文件路径
     * @param ext 可选的文件扩展名，如果提供则会从结果中移除
     */
    basename: (path: string, ext?: string): Promise<string> =>
        trpcClient.filesystem.basename.query({
            filePath: path,
            ext
        }),

    /**
     * 获取路径中的目录名
     * @description 如果path为目录，则返回父目录
     * @remarks 用时 <10ms
     * @param path 文件路径
     */
    dirname: (path: string): Promise<string> => trpcClient.filesystem.dirname.query(path),

    /**
     * 从对象中格式化路径
     * @remarks 用时 <10ms
     * @param pathObject 包含路径组件的对象
     */
    format: (pathObject: IFormatInputPathObject): Promise<string> =>
        trpcClient.filesystem.format.query(pathObject),

    /**
	 * 获取to基于from的相对路径
	 * @remarks 用时 <10ms
	 * @param from 源路径
	 * @param to 目标路径
	 * @template
	 * ```ts
	 * const from = '/home/user/app/src';
const to = '/home/user/app/dist';
// 返回: '../dist'
	 * ```
	 */
    relative: (from: string, to: string): Promise<string> =>
        trpcClient.filesystem.relative.query({
            from,
            to
        }),

    /**
     * 递归创建目录
     * @description 如果目录已存在则跳过，最终根据目录是否存在（包括创建完成后）来返回boolean
     * @remarks 用时 <10ms
     * @param dirPath 要创建的目录路径
     * @returns 目录是否存在或创建成功
     */
    createDirectory: (dirPath: string): Promise<boolean> =>
        trpcClient.filesystem.createDirectory.mutate(dirPath),

    /**
     * 使用fast-glob搜索文件和目录
     * @remarks 用时与文件数量相关，在5-100ms左右，正常10ms上下
     * @description 由于ipc原因，不提供stats选项，需要获取文件状态请使用getSatus
     * @param patterns 搜索模式，支持通配符，如 '**\/*.js'
     * @param options 搜索选项
     * @example
     * ```ts
     * // 搜索所有js文件
     * const files = await filesystem.readDirectory('**\/*.js', { cwd: '/path/to/dir' });
     *
     * // 只搜索目录
     * const dirs = await filesystem.readDirectory('**', { onlyDirectories: true });
     *
     * // 限制搜索深度
     * const shallow = await filesystem.readDirectory('**', { deep: 2 });
     *
     * // 获取文件统计信息
     * const withStats = await filesystem.readDirectory('**\/*.js', { stats: true });
     * ```
     */
    readDirectory: (
        patterns: string | string[],
        options?: ReadDirectoryOptions
    ): Promise<string[]> =>
        trpcClient.filesystem.readDirectory.query({
            patterns,
            options
        }),

    /**
     * 删除文件或目录
     * @remarks 用时 <10ms
     * @param targetPath 要删除的文件或目录路径
     * @returns 目标是否已不存在
     */
    remove: (targetPath: string): Promise<boolean> =>
        trpcClient.filesystem.remove.mutate(targetPath),

    /**
     * 复制文件或目录
     * @remarks 用时与文件大小和数量相关
     * @param sourcePath 源文件或目录路径
     * @param destPath 目标路径
     * @param overwrite 是否覆盖已存在的文件或目录，默认为true
     * @param filter 过滤函数，返回true表示复制该文件，false表示跳过
     */
    copy: (
        sourcePath: string,
        destPath: string,
        overwrite: boolean = true,
        filter?: (src: string, dest: string) => boolean
    ): Promise<boolean> =>
        trpcClient.filesystem.copy.mutate({
            sourcePath,
            destPath,
            overwrite,
            filter
        }),

    /**
     * 移动文件或目录
     * @remarks 用时与文件大小和数量相关
     * @param sourcePath 源文件或目录路径
     * @param destPath 目标路径
     * @param overwrite 是否覆盖已存在的文件或目录，默认为true
     */
    move: (sourcePath: string, destPath: string, overwrite: boolean = true): Promise<boolean> =>
        trpcClient.filesystem.move.mutate({
            sourcePath,
            destPath,
            overwrite
        }),

    /**
     * 写入文件（如果目录不存在自动则创建）
     * @remarks 用时 <10ms
     * @param filePath 文件路径
     * @param data 要写入的数据
     */
    writeFile: (filePath: string, data: string | ArrayBufferView): Promise<boolean> =>
        trpcClient.filesystem.writeFile.mutate({
            filePath,
            data: data as unknown as string | ArrayBufferView
        }),

    /**
     * 追加内容到文件（如果文件不存在则自动创建）
     * @remarks 用时 <10ms
     * @param filePath 文件路径
     * @param data 要追加的数据
     */
    appendFile: (filePath: string, data: string | Uint8Array): Promise<boolean> =>
        trpcClient.filesystem.appendFile.mutate({
            filePath,
            data
        }),

    readFile,

    /**
     * 写入日志
     * @remarks 用时 <10ms
     */
    writeLog: (type: ILogType, ...params: any[]): void =>
        sendTask(
            trpcClient.filesystem.writeLog.mutate({
                type,
                params
            })
        ),

    /**
     * 在资源管理器中打开路径
     * @remarks 用时 <10ms
     * @param path 要打开的路径
     */
    openInExplorer: (path: string): Promise<boolean> =>
        trpcClient.filesystem.openInExplorer.mutate(path),

    /**
     * 获取前端文件的实际绝对路径
     * @remarks 用时 <10ms
     * @param file 文件
     * @returns 文件路径
     */
    getPathForFile: (file: File) =>
        // @ts-ignore
        (window.api as any).getPathForFile(file),

    /**
     * 删除空文件夹
     * @remarks 用时 <10ms
     * @param rootPath 根路径
     */
    removeEmptyFolders: (rootPath: string): Promise<void> =>
        trpcClient.filesystem.removeEmptyFolders.mutate(rootPath),

    /**
     * 清空文件夹（删除文件夹内所有内容，保留文件夹本身）
     * @remarks 用时与文件数量相关
     * @param folderPath 要清空的文件夹路径
     * @returns 是否成功清空
     */
    clearFolder: (folderPath: string): Promise<boolean> =>
        trpcClient.filesystem.clearFolder.mutate(folderPath)
}

function readFile(filePath: string, encoding: BufferEncoding): Promise<string>
function readFile(filePath: string, encoding: 'arrayBuffer'): Promise<ArrayBuffer>
function readFile(filePath: string): Promise<ArrayBuffer>
/**
 * 读取文件内容
 * @remarks 用时 <10ms
 * @param filePath 文件路径
 * @param [encoding] 文件编码
 */
function readFile(
    filePath: string,
    encoding: BufferEncoding | 'arrayBuffer' = 'utf-8'
): Promise<string | ArrayBuffer> {
    return trpcClient.filesystem.readFile.query({
        filePath,
        encoding: encoding || undefined
    }) as Promise<string | ArrayBuffer>
}
