import * as fs from 'node:fs'
import * as path from 'node:path'
import { BrowserWindow, shell } from 'electron'
import log from 'electron-log'

import { readDirectory } from '../utils/fs'

/**
 * 在资源管理器中打开路径
 */
export async function openInExplorer(filePath: string) {
    await shell.openPath(path.normalize(filePath))
    return true
}

/**
 * 设置主窗口进度条
 */
export function setProgressBar(progress: number) {
    const mainWindow = BrowserWindow.getAllWindows()[0]
    if (!mainWindow) return false

    mainWindow.setProgressBar(progress)
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
