import * as fs from 'node:fs'
import * as path from 'node:path'
import { shell } from 'electron'
import log from 'electron-log'
import pkg from 'fs-extra'
import { glob } from 'tinyglobby'
import { z } from 'zod'

const { ensureDirSync, copySync, moveSync, outputFileSync } = pkg

/**
 * 日志类型
 */
export type ILogType = 'log' | 'error' | 'warn' | 'success' | 'debug'

/**
 * 日志类型枚举
 */
export const logTypeSchema = z.enum(['log', 'error', 'warn', 'success', 'debug'])

export const readDirectoryOptionsSchema = z.object({
    /**
     * 是否返回文件状态
     * @default false
     */
    stats: z.boolean().optional(),
    /**
     * 忽略的文件名
     * @description 一个由 glob 表达式组成的数组，匹配到的文件或目录会被排除在结果之外
     * @default []
     */
    ignore: z.array(z.string()).optional(),
    /**
     * 是否包含隐藏文件
     * @default true
     */
    dot: z.boolean().optional(),
    /**
     * 是否跟随符号链接
     * @description 在 macOS 或 Linux 上，有时会创建一个类似“快捷方式”的链接文件。windows上基本没有影响。
     * @default true
     */
    followSymbolicLinks: z.boolean().optional(),
    /**
     * 是否只返回文件
     * @default false
     */
    onlyFiles: z.boolean().optional(),
    /**
     * 是否只返回目录
     * @default false
     */
    onlyDirectories: z.boolean().optional()
})

export type ReadDirectoryOptions = z.infer<typeof readDirectoryOptionsSchema>

export interface IStats {
    /**
     * 创建时间
     */
    birthtime: string
    /**
     * 修改时间
     * @description 文件内容最后一次被修改的时间。（比如你编辑了文本、修改了图片）
     */
    mtime: string
    /**
     * 变更时间
     * @description 文件元数据（如权限、所有者）或内容最后一次被修改的时间。（改名、移动位置、改权限都会更新它）
     */
    ctime: string
    /**
     * 文件大小
     */
    size: number
    /**
     * 是否是文件
     */
    isFile: boolean
    /**
     * 是否是目录
     */
    isDirectory: boolean
}

export interface IFile {
    /**
     * 文件路径
     */
    path: string
    /**
     * 文件名称，不包含扩展名
     */
    name: string
    /**
     * 文件扩展名，如果是目录则没有扩展名
     */
    extname?: string
    /**
     * 文件名称，包含扩展名
     */
    fullName: string
    /**
     * 文件状态
     */
    stats: IStats
}

/**
 * 路径对象结构
 */
export const formatInputPathObjectSchema = z.object({
    /**
     * 路径的根部分，例如 '/' 或 'c:\'
     */
    root: z.string().optional(),
    /**
     * 完整的目录路径，例如 '/home/user/dir' 或 'c:\path\dir'
     */
    dir: z.string().optional(),
    /**
     * 包含扩展名（如果有）的文件名，例如 'index.html'
     */
    base: z.string().optional(),
    /**
     * 文件扩展名（如果有）
     */
    ext: z.string().optional(),
    /**
     * 不含扩展名的文件名（如果有）
     */
    name: z.string().optional()
})

export type FormatInputPathObject = z.infer<typeof formatInputPathObjectSchema>

/**
 * 转换文件状态
 * @param stats 文件状态
 */
function toStats(stats: fs.Stats): IStats {
    return {
        birthtime: stats.birthtime.toISOString(),
        mtime: stats.mtime.toISOString(),
        ctime: stats.ctime.toISOString(),
        size: stats.size,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory()
    }
}

/**
 * 判断 path 是否存在于磁盘上
 */
export function isExist(filePath: string) {
    return fs.existsSync(path.normalize(filePath))
}

/**
 * 判断 path 是否为文件
 */
export function isFile(filePath: string) {
    return fs.statSync(path.normalize(filePath)).isFile()
}

/**
 * 判断 path 是否为目录
 */
export function isDirectory(filePath: string) {
    return fs.statSync(path.normalize(filePath)).isDirectory()
}

/**
 * 获取 path 状态信息
 */
export function getStatus(filePath: string[]): { path: string; stats: IStats }[]
export function getStatus(filePath: string): IStats
export function getStatus(filePath: string | string[]): IStats | { path: string; stats: IStats }[] {
    if (Array.isArray(filePath)) {
        return filePath.map((item) => ({
            path: item,
            stats: toStats(fs.statSync(path.normalize(item)))
        }))
    }

    return toStats(fs.statSync(path.normalize(filePath)))
}

/**
 * 路径拼接
 */
export function join(...pathSegments: string[]) {
    return path.join(...pathSegments)
}

/**
 * 拼接并解析绝对路径
 */
export function resolve(...pathSegments: string[]) {
    return path.resolve(...pathSegments)
}

/**
 * 获取文件扩展名
 */
export function extname(filePath: string) {
    return path.extname(filePath)
}

/**
 * 获取路径中的文件名
 */
export function basename(filePath: string, ext?: string) {
    return path.basename(filePath, ext)
}

/**
 * 获取路径中的目录名
 */
export function dirname(filePath: string) {
    return path.dirname(filePath)
}

/**
 * 从对象中格式化路径
 */
export function format(pathObject: FormatInputPathObject) {
    return path.format(pathObject)
}

/**
 * 获取从一个路径到另一个路径的相对路径
 */
export function relative(from: string, to: string) {
    return path.relative(from, to)
}

/**
 * 递归创建目录，如果目录已存在则跳过
 */
export function createDirectory(dirPath: string) {
    dirPath = path.normalize(dirPath)
    if (fs.existsSync(dirPath)) {
        return true
    }
    ensureDirSync(dirPath)
    return fs.existsSync(dirPath)
}

/**
 * 搜索文件和目录
 * @param directory 要搜索的目录
 * @param pattern 搜索通配符
 */
export async function readDirectory(
    directory: string,
    pattern: string | string[],
    options: ReadDirectoryOptions & { stats: true }
): Promise<IFile[]>
export async function readDirectory(
    directory: string,
    pattern: string | string[],
    options?: ReadDirectoryOptions & { stats?: false | undefined }
): Promise<string[]>
export async function readDirectory(
    directory: string,
    pattern: string | string[],
    options?: ReadDirectoryOptions
): Promise<string[] | IFile[]>
export async function readDirectory(
    directory: string,
    pattern: string | string[],
    options: ReadDirectoryOptions = {}
): Promise<string[] | IFile[]> {
    const { stats, ...globOptions } = options
    const cleanGlobOptions = Object.fromEntries(
        Object.entries(globOptions).filter(([, value]) => value !== undefined)
    )

    const files = await glob(pattern, {
        dot: true,
        followSymbolicLinks: true,
        onlyFiles: false,
        onlyDirectories: false,
        ...cleanGlobOptions,
        cwd: directory,
        absolute: true,
        expandDirectories: false,
        caseSensitiveMatch: false
    })

    if (stats !== true) {
        return files
    }

    return files.map((filePath) => {
        const fileStats = fs.statSync(filePath)
        const extname = fileStats.isDirectory() ? undefined : path.extname(filePath)

        return {
            name: path.basename(filePath, extname),
            fullName: path.basename(filePath),
            path: filePath,
            stats: toStats(fileStats),
            ...(extname ? { extname } : {})
        }
    })
}

/**
 * 删除文件或目录
 */
export async function remove(targetPath: string) {
    targetPath = path.normalize(targetPath)

    if (!fs.existsSync(targetPath)) {
        return true
    }
    await shell.trashItem(targetPath)
    return !fs.existsSync(targetPath)
}

/**
 * 复制文件或目录
 */
export function copy(
    sourcePath: string,
    destPath: string,
    overwrite: boolean = true,
    filter?: (src: string, dest: string) => boolean
) {
    sourcePath = path.normalize(sourcePath)
    destPath = path.normalize(destPath)
    const options = {
        overwrite,
        filter
    }
    if (sourcePath === destPath) return true
    copySync(sourcePath, destPath, options)
    return true
}

/**
 * 移动文件或目录
 */
export function move(sourcePath: string, destPath: string, overwrite: boolean = true) {
    sourcePath = path.normalize(sourcePath)
    destPath = path.normalize(destPath)
    moveSync(sourcePath, destPath, { overwrite })
    return true
}

/**
 * 写入文件（如果目录不存在则创建）
 */
export function writeFile(filePath: string, data: string | ArrayBufferView) {
    outputFileSync(path.normalize(filePath), data as NodeJS.ArrayBufferView)
    return true
}

/**
 * 追加内容到文件（如果文件不存在则创建）
 */
export function appendFile(filePath: string, data: string | Uint8Array) {
    fs.appendFileSync(path.normalize(filePath), data)
    return true
}

/**
 * 读取文件内容
 */
export function readFile(filePath: string, encoding: BufferEncoding | 'arrayBuffer' = 'utf-8') {
    filePath = path.normalize(filePath)
    if (encoding === 'arrayBuffer') {
        const buffer = fs.readFileSync(filePath)
        return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    }
    return fs.readFileSync(filePath, encoding)
}

const logMethodMap: Record<ILogType, 'log' | 'error' | 'warn' | 'info' | 'debug'> = {
    log: 'log',
    error: 'error',
    warn: 'warn',
    success: 'info',
    debug: 'debug'
}

/**
 * 写入 log 文件
 */
export function writeLog(type: ILogType, ...params: any[]) {
    try {
        log[logMethodMap[type]](...params)
    } catch (e) {
        console.warn(`log写入失败: [${type}] ${params.join(' ')}`, e)
    }
}

/**
 * 在资源管理器中打开路径
 */
export async function openInExplorer(filePath: string) {
    await shell.openPath(path.normalize(filePath))
    return true
}

/**
 * 清空文件夹（删除文件夹内所有内容，保留文件夹本身）
 */
export async function clearFolder(folderPath: string) {
    folderPath = path.normalize(folderPath)

    if (fs.existsSync(folderPath) && fs.statSync(folderPath).isDirectory()) {
        // 1. 递归删除整个文件夹
        await shell.trashItem(folderPath)
    }

    // 2. 重新创建该文件夹
    await fs.promises.mkdir(folderPath, { recursive: true })

    return true
}

/**
 * 删除没有视频文件的空目录
 */
export async function removeEmptyFolders(rootPath: string, videoExtnames: string[]) {
    rootPath = path.normalize(rootPath)

    if (!fs.existsSync(rootPath) || !fs.statSync(rootPath).isDirectory()) return

    // 定义视频文件扩展名
    const videoExtPattern = videoExtnames.map((ext) => ext.slice(1)).join(',')

    // 分两次获取文件夹和视频文件
    const dirs = await readDirectory(rootPath, '**/', {
        onlyDirectories: true,
        ignore: ['**/extrafanart/**']
    })
    const videoFiles = await readDirectory(rootPath, `**/*.{${videoExtPattern}}`, {
        onlyFiles: true,
        ignore: ['**/extrafanart/**']
    })

    // 构建包含视频的目录集合（包括所有父目录）
    const videoDirs = new Set<string>()
    for (const videoFile of videoFiles) {
        let currentDir = path.relative(rootPath, path.dirname(videoFile))
        while (currentDir && currentDir !== path.sep && currentDir !== '.') {
            if (videoDirs.has(currentDir)) break
            videoDirs.add(currentDir)
            currentDir = path.dirname(currentDir)
        }
    }

    // 筛选没有视频的路径，按路径长度排序，确保从最浅的文件夹开始处理
    const emptyDirs = dirs
        .map((dir) => path.relative(rootPath, dir))
        .filter((dir) => !videoDirs.has(dir))
        .sort((a, b) => a.length - b.length)

    const topLevelDirs = new Set<string>()
    for (const dir of emptyDirs) {
        let isSubPath = false
        for (const topDir of Array.from(topLevelDirs)) {
            if (dir.startsWith(topDir + path.sep)) {
                isSubPath = true
                break
            }
        }

        if (!isSubPath) {
            topLevelDirs.add(dir)
        }
    }

    const result = Array.from(topLevelDirs).map((dir) => path.join(rootPath, dir))

    for (const dir of result) {
        try {
            await shell.trashItem(dir)
            log.info(`删除无视频文件夹：${dir}`)
        } catch (error) {
            log.warn(`删除无视频文件夹失败：${dir}`, error)
        }
    }
}
