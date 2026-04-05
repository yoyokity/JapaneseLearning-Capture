import * as fs from 'node:fs'
import * as path from 'node:path'
import { ipcMain, shell } from 'electron'
import log from 'electron-log'
import fg from 'fast-glob'
import pkg from 'fs-extra'

import { tryExecute, tryExecuteSync } from './func'

const { ensureDirSync, copySync, moveSync, outputFileSync } = pkg

// 判断path是否存在于磁盘上
ipcMain.handle('filesystem:isExist', (_, filePath: string) => {
    return tryExecuteSync(fs.existsSync, path.normalize(filePath))
})

// 判断path是否为文件
ipcMain.handle('filesystem:isFile', (_, filePath: string) => {
    return tryExecuteSync(() => fs.statSync(path.normalize(filePath)).isFile())
})

// 判断path是否为目录
ipcMain.handle('filesystem:isDirectory', (_, filePath: string) => {
    return tryExecuteSync(() => fs.statSync(path.normalize(filePath)).isDirectory())
})

// 获取path状态信息
ipcMain.handle('filesystem:getStatus', (_, filePath: string) => {
    return tryExecuteSync(fs.statSync, path.normalize(filePath))
})

// 路径拼接
ipcMain.handle('filesystem:join', (_, ...pathSegments: string[]) => {
    return tryExecuteSync(path.join, ...pathSegments)
})

// 路径拼接
ipcMain.handle('filesystem:resolve', (_, ...pathSegments: string[]) => {
    return tryExecuteSync(path.resolve, ...pathSegments)
})

// 获取文件扩展名
ipcMain.handle('filesystem:extname', (_, filePath: string) => {
    return tryExecuteSync(path.extname, filePath)
})

// 获取路径中的文件名
ipcMain.handle('filesystem:basename', (_, filePath: string, ext?: string) => {
    return tryExecuteSync(path.basename, filePath, ext)
})

// 获取路径中的目录名
ipcMain.handle('filesystem:dirname', (_, filePath: string) => {
    return tryExecuteSync(path.dirname, filePath)
})

// 从对象中格式化路径
ipcMain.handle('filesystem:format', (_, pathObject: path.FormatInputPathObject) => {
    return tryExecuteSync(path.format, pathObject)
})

// 获取从一个路径到另一个路径的相对路径
ipcMain.handle('filesystem:relative', (_, from: string, to: string) => {
    return tryExecuteSync(path.relative, from, to)
})

// 递归创建目录，如果目录已存在则跳过
ipcMain.handle('filesystem:createDirectory', (_, dirPath: string) => {
    return tryExecuteSync(createDirectory, dirPath)
})

export function createDirectory(dirPath: string) {
    dirPath = path.normalize(dirPath)
    if (fs.existsSync(dirPath)) {
        return true
    }
    ensureDirSync(dirPath)
    return fs.existsSync(dirPath)
}

// 使用fast-glob搜索文件和目录
ipcMain.handle(
    'filesystem:readDirectory',
    async (
        _,
        patterns: string | string[],
        options: {
            cwd?: string
            ignore?: string[]
            onlyFiles?: boolean
            onlyDirectories?: boolean
            deep?: number
        }
    ) => {
        return await tryExecute(async () => {
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
        })
    }
)

// 删除文件或目录
ipcMain.handle('filesystem:remove', (_, targetPath: string) => {
    return tryExecute(async () => {
        targetPath = path.normalize(targetPath)

        if (!fs.existsSync(targetPath)) {
            return true // 目标已经不存在，视为删除成功
        }
        await shell.trashItem(targetPath)
        // 返回目标是否已不存在（删除成功）
        return !fs.existsSync(targetPath)
    })
})

// 复制文件或目录
ipcMain.handle(
    'filesystem:copy',
    (
        _,
        sourcePath: string,
        destPath: string,
        overwrite: boolean = true,
        filter?: (src: string, dest: string) => boolean
    ) => {
        return tryExecuteSync(() => {
            sourcePath = path.normalize(sourcePath)
            destPath = path.normalize(destPath)
            const options = {
                overwrite,
                filter
            }
            if (sourcePath === destPath) return true
            copySync(sourcePath, destPath, options)
            return true
        })
    }
)

// 移动文件或目录
ipcMain.handle(
    'filesystem:move',
    (_, sourcePath: string, destPath: string, overwrite: boolean = true) => {
        return tryExecuteSync(() => {
            sourcePath = path.normalize(sourcePath)
            destPath = path.normalize(destPath)
            moveSync(sourcePath, destPath, { overwrite })
            return true
        })
    }
)

// 写入文件（如果目录不存在则创建）
ipcMain.handle(
    'filesystem:writeFile',
    (_, filePath: string, data: string | NodeJS.ArrayBufferView) => {
        return tryExecuteSync(() => {
            outputFileSync(path.normalize(filePath), data)
            return true
        })
    }
)

// 追加内容到文件（如果文件不存在则创建）
ipcMain.handle('filesystem:appendFile', (_, filePath: string, data: string | Uint8Array) => {
    return tryExecuteSync(() => {
        fs.appendFileSync(path.normalize(filePath), data)
        return true
    })
})

// 读取文件内容
ipcMain.handle(
    'filesystem:readFile',
    (_, filePath: string, encoding: BufferEncoding | 'arrayBuffer') => {
        return tryExecuteSync(() => {
            filePath = path.normalize(filePath)
            if (encoding === 'arrayBuffer') {
                // 如果 encoding 为 'buffer'，返回 ArrayBuffer
                const buffer = fs.readFileSync(filePath)
                return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
            } else {
                // 否则使用指定的编码（默认为 'utf-8'）
                return fs.readFileSync(filePath, encoding)
            }
        })
    }
)

type ILogType = 'log' | 'error' | 'warn' | 'success' | 'debug'

const logMethodMap: Record<ILogType, 'log' | 'error' | 'warn' | 'info' | 'debug'> = {
    log: 'log',
    error: 'error',
    warn: 'warn',
    success: 'info',
    debug: 'debug'
}

// 写入log文件
ipcMain.on('filesystem:writeLog', (_, type: ILogType, ...params: any[]) => {
    try {
        log[logMethodMap[type]](...params)
    } catch (e) {
        console.warn(`log写入失败: [${type}] ${params.join(' ')}`, e)
    }
})

// 在资源管理器中打开路径
ipcMain.handle('filesystem:openInExplorer', (_, filePath: string) => {
    return tryExecute(async () => {
        await shell.openPath(path.normalize(filePath))
        return true
    })
})

// 清空文件夹（删除文件夹内所有内容，保留文件夹本身）
ipcMain.handle('filesystem:clearFolder', async (_, folderPath: string) => {
    return await tryExecute(async () => {
        folderPath = path.normalize(folderPath)

        if (fs.existsSync(folderPath) && fs.statSync(folderPath).isDirectory()) {
            // 1. 递归删除整个文件夹
            await shell.trashItem(folderPath)
        }

        // 2. 重新创建该文件夹
        await fs.promises.mkdir(folderPath, { recursive: true })

        return true
    })
})

//通过fast-glob，从最深的文件夹遍历到最浅的文件夹，如果文件夹内没有视频文件，则删除该文件夹
ipcMain.handle('filesystem:removeEmptyFolders', async (_, rootPath: string) => {
    return await tryExecute(async () => {
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
                if (videoDirs.has(currentDir)) break // 已处理过，上级也都处理过了
                videoDirs.add(currentDir)
                currentDir = path.dirname(currentDir)
            }
        }

        // 筛选没有视频的路径，按路径长度排序，确保从最浅的文件夹开始处理
        const emptyDirs = dirs
            .filter((dir) => !videoDirs.has(dir))
            .sort((a, b) => a.length - b.length)

        const topLevelDirs = new Set<string>()
        for (const dir of emptyDirs) {
            // 检查当前路径是否是已找到的顶级目录的子路径
            let isSubPath = false
            // 使用 Array.from 将 Set 转换为数组再遍历
            for (const topDir of Array.from(topLevelDirs)) {
                if (dir.startsWith(topDir + path.sep)) {
                    isSubPath = true
                    break
                }
            }

            // 如果不是子路径，就把它作为顶级目录添加
            if (!isSubPath) {
                topLevelDirs.add(dir)
            }
        }

        // 将 Set 转换为数组
        const result = Array.from(topLevelDirs).map((dir) => path.join(rootPath, dir))

        for (const dir of result) {
            try {
                await shell.trashItem(dir)
                log.info(`删除无视频文件夹：${dir}`)
            } catch (error) {
                log.warn(`删除无视频文件夹失败：${dir}`, error)
            }
        }
    })
})
