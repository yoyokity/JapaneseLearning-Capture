import * as fs from 'node:fs'
import * as path from 'node:path'
import { shell } from 'electron'
import log from 'electron-log'
import fg from 'fast-glob'
import pkg from 'fs-extra'
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

/**
 * 目录读取选项
 */
export interface ReadDirectoryOptions {
    /**
     * 指定搜索的起始目录
     */
    cwd?: string
    /**
     * 要忽略的文件或目录模式数组
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
     */
    deep?: number
}

/**
 * 目录读取选项结构
 */
export const readDirectoryOptionsSchema = z.object({
    cwd: z.string().optional(),
    ignore: z.array(z.string()).optional(),
    onlyFiles: z.boolean().optional(),
    onlyDirectories: z.boolean().optional(),
    deep: z.number().int().optional()
})

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
    atime: string
    mtime: string
    ctime: string
    birthtime: string
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

/**
 * 路径对象结构
 */
export const formatInputPathObjectSchema = z.object({
    root: z.string().optional(),
    dir: z.string().optional(),
    base: z.string().optional(),
    ext: z.string().optional(),
    name: z.string().optional()
})

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
export function getStatus(filePath: string) {
    return fs.statSync(path.normalize(filePath))
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
export function format(pathObject: IFormatInputPathObject) {
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
 * 使用 fast-glob 搜索文件和目录
 */
export async function readDirectory(
    patterns: string | string[],
    options: ReadDirectoryOptions = {}
) {
    const searchOptions = {
        ...options,
        absolute: true,
        dot: true,
        stats: false
    }

    // 如果没有明确指定只要文件或只要目录，则默认获取两者
    if (options.onlyFiles === undefined && options.onlyDirectories === undefined) {
        searchOptions.onlyFiles = false
    }

    return await fg.glob(patterns, searchOptions)
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
export async function removeEmptyFolders(rootPath: string) {
    rootPath = path.normalize(rootPath)

    if (!fs.existsSync(rootPath) || !fs.statSync(rootPath).isDirectory()) return

    // 定义视频文件扩展名
    const videoExtensions = ['.mp4', '.mkv', '.avi', '.wmv', '.mov', '.flv', '.webm']
    const videoExtPattern = videoExtensions.map((ext) => ext.slice(1)).join(',')

    // 一次性获取所有文件夹和视频文件
    const entries = await fg.glob(['**/', `**/*.{${videoExtPattern}}`], {
        cwd: rootPath,
        dot: true,
        deep: Infinity,
        absolute: true,
        onlyFiles: false,
        stats: true,
        ignore: ['**/extrafanart']
    })

    // 分离文件夹和视频文件
    const dirs: string[] = []
    const videoFiles: string[] = []

    for (const entry of entries) {
        if (entry.stats && entry.stats.isDirectory()) {
            // 文件夹
            dirs.push(path.normalize(path.relative(rootPath, entry.path)))
        } else if (entry.stats && entry.stats.isFile()) {
            // 视频文件
            videoFiles.push(path.normalize(path.relative(rootPath, entry.path)))
        }
    }

    // 构建包含视频的目录集合（包括所有父目录）
    const videoDirs = new Set<string>()
    for (const videoFile of videoFiles) {
        let currentDir = path.dirname(videoFile)
        while (currentDir && currentDir !== path.sep && currentDir !== '.') {
            if (videoDirs.has(currentDir)) break
            videoDirs.add(currentDir)
            currentDir = path.dirname(currentDir)
        }
    }

    // 筛选没有视频的路径，按路径长度排序，确保从最浅的文件夹开始处理
    const emptyDirs = dirs.filter((dir) => !videoDirs.has(dir)).sort((a, b) => a.length - b.length)

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
