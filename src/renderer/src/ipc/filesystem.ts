import { invoke, send } from '@renderer/ipc/func.ts'

/**
 * 文件系统
 */
export const filesystem = {
    /**
     * 判断path是否存在于磁盘上
     * @remarks 用时 <10ms
     */
    isExist: (path: string): Promise<boolean> => invoke('filesystem:isExist', path),

    /**
     * 判断path是否为文件
     * @remarks 用时 <10ms
     */
    isFile: (path: string): Promise<boolean> => invoke('filesystem:isFile', path),

    /**
     * 判断path是否为目录
     * @remarks 用时 <10ms
     */
    isDirectory: (path: string): Promise<boolean> => invoke('filesystem:isDirectory', path),

    /**
     * 获取path状态信息
     * @remarks 用时 <10ms
     */
    getSatus: (path: string): Promise<IStats> => invoke('filesystem:getStatus', path),

    /**
     * 路径拼接
     * @remarks 用时 <10ms
     */
    join: (...paths: string[]): Promise<string> => invoke('filesystem:join', ...paths),

    /**
     * 拼接并解析绝对路径
     * @remarks 用时 <10ms
     */
    resolve: (...paths: string[]): Promise<string> => invoke('filesystem:resolve', ...paths),

    /**
     * 获取文件扩展名，如果为目录则返回''
     * @description 包含点号
     * @remarks 用时 <10ms
     * @param path 文件路径
     */
    extname: (path: string): Promise<string> => invoke('filesystem:extname', path),

    /**
     * 获取路径中的文件名
     * @description 如果path为目录，则返回最后一级目录
     * @remarks 用时 <10ms
     * @param path 文件路径
     * @param ext 可选的文件扩展名，如果提供则会从结果中移除
     */
    basename: (path: string, ext?: string): Promise<string> =>
        invoke('filesystem:basename', path, ext),

    /**
     * 获取路径中的目录名
     * @description 如果path为目录，则返回父目录
     * @remarks 用时 <10ms
     * @param path 文件路径
     */
    dirname: (path: string): Promise<string> => invoke('filesystem:dirname', path),

    /**
     * 从对象中格式化路径
     * @remarks 用时 <10ms
     * @param pathObject 包含路径组件的对象
     */
    format: (pathObject: IFormatInputPathObject): Promise<string> =>
        invoke('filesystem:format', pathObject),

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
        invoke('filesystem:relative', from, to),

    /**
     * 递归创建目录
     * @description 如果目录已存在则跳过，最终根据目录是否存在（包括创建完成后）来返回boolean
     * @remarks 用时 <10ms
     * @param dirPath 要创建的目录路径
     * @returns 目录是否存在或创建成功
     */
    createDirectory: (dirPath: string): Promise<boolean> =>
        invoke('filesystem:createDirectory', dirPath),

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
    ): Promise<string[]> => invoke('filesystem:readDirectory', patterns, options),

    /**
     * 删除文件或目录
     * @remarks 用时 <10ms
     * @param targetPath 要删除的文件或目录路径
     * @returns 目标是否已不存在
     */
    remove: (targetPath: string): Promise<boolean> => invoke('filesystem:remove', targetPath),

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
    ): Promise<boolean> => invoke('filesystem:copy', sourcePath, destPath, overwrite, filter),

    /**
     * 移动文件或目录
     * @remarks 用时与文件大小和数量相关
     * @param sourcePath 源文件或目录路径
     * @param destPath 目标路径
     * @param overwrite 是否覆盖已存在的文件或目录，默认为true
     */
    move: (sourcePath: string, destPath: string, overwrite: boolean = true): Promise<boolean> =>
        invoke('filesystem:move', sourcePath, destPath, overwrite),

    /**
     * 写入文件（如果目录不存在自动则创建）
     * @remarks 用时 <10ms
     * @param filePath 文件路径
     * @param data 要写入的数据
     */
    writeFile: (filePath: string, data: string | ArrayBufferView): Promise<boolean> =>
        invoke('filesystem:writeFile', filePath, data),

    /**
     * 追加内容到文件（如果文件不存在则自动创建）
     * @remarks 用时 <10ms
     * @param filePath 文件路径
     * @param data 要追加的数据
     */
    appendFile: (filePath: string, data: string | Uint8Array): Promise<boolean> =>
        invoke('filesystem:appendFile', filePath, data),

    readFile,

    /**
     * 写入日志
     * @remarks 用时 <10ms
     */
    writeLog: (type: 'log' | 'error' | 'warn' | 'info', ...params: any[]): void =>
        send('filesystem:writeLog', type, ...params),

    /**
     * 在资源管理器中打开路径
     * @remarks 用时 <10ms
     * @param path 要打开的路径
     */
    openInExplorer: (path: string): Promise<boolean> => invoke('filesystem:openInExplorer', path),

    /**
     * 获取前端文件的实际绝对路径
     * @remarks 用时 <10ms
     * @param file 文件
     * @returns 文件路径
     */
    getPathForFile: (file: File) => (window.api as any).getPathForFile(file),

    /**
     * 删除空文件夹
     * @remarks 用时 <10ms
     * @param rootPath 根路径
     */
    removeEmptyFolders: (rootPath: string): Promise<void> =>
        invoke('filesystem:removeEmptyFolders', rootPath)
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
    return invoke('filesystem:readFile', filePath, encoding || undefined)
}

export interface ReadDirectoryOptions {
    /**
     * 指定搜索的起始目录
     */
    cwd?: string
    /**
     * 要忽略的文件或目录模式数组
     * @example ['node_modules/**', '*.tmp']
     */
    ignore?: string[]
    /**
     * 是否只搜索文件
     */
    onlyFiles?: boolean
    /**
     * 是否只搜索目录
     */
    onlyDirectories?: boolean
    /**
     * 搜索的最大深度
     * @example 1 - 只在指定目录中搜索
     * @example 2 - 搜索指定目录及其直接子目录
     */
    deep?: number
}

export interface IStats extends IStatsBase<number> {}
interface IStatsBase<T> {
    dev: T
    ino: T
    mode: T
    nlink: T
    uid: T
    gid: T
    rdev: T
    size: T
    blksize: T
    blocks: T
    atimeMs: T
    mtimeMs: T
    ctimeMs: T
    birthtimeMs: T
    atime: Date
    mtime: Date
    ctime: Date
    birthtime: Date

    isFile: () => boolean

    isDirectory: () => boolean

    isBlockDevice: () => boolean

    isCharacterDevice: () => boolean

    isSymbolicLink: () => boolean

    isFIFO: () => boolean

    isSocket: () => boolean
}

export interface IFormatInputPathObject {
    /**
     * 路径的根部分，例如 '/' 或 'c:\'
     */
    root?: string | undefined
    /**
     * 完整的目录路径，例如 '/home/user/dir' 或 'c:\path\dir'
     */
    dir?: string | undefined
    /**
     * 包含扩展名（如果有）的文件名，例如 'index.html'
     */
    base?: string | undefined
    /**
     * 文件扩展名（如果有），例如 '.html'
     */
    ext?: string | undefined
    /**
     * 不含扩展名的文件名（如果有），例如 'index'
     */
    name?: string | undefined
}
