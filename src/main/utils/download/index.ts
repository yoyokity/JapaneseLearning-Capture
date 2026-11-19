import { createHash } from 'node:crypto'
import { once } from 'node:events'
import {
    createReadStream,
    createWriteStream,
    readFileSync,
    renameSync,
    rmSync,
    statSync,
    truncateSync,
    writeFileSync
} from 'node:fs'
import { finished } from 'node:stream/promises'
import { net } from 'electron'

import { DOWNLOAD_BLOCK_SIZE, DOWNLOAD_CONNECTIONS, runWithConcurrency } from './shared'

/** 下载超时 */
const DOWNLOAD_TIMEOUT = 30 * 60 * 1000
/** 最大重试次数 */
const MAX_DOWNLOAD_RETRIES = 3

export interface IDownloadOptions {
    /** 下载地址 */
    url: string
    /** 文件大小（字节） */
    size: number
    /** 文件 sha256，用于下载后校验 */
    sha256: string
    /** 下载完成的保存路径 */
    targetPath: string
    /** 已下载字节数回调 */
    onProgress?: (received: number) => void
}

interface IPartState {
    /** 文件总大小 */
    size: number
    /** 每块已写入字节数 */
    received: number[]
}

/** 获取分块范围 */
function getBlockRange(index: number, size: number) {
    const start = index * DOWNLOAD_BLOCK_SIZE
    const end = Math.min(start + DOWNLOAD_BLOCK_SIZE, size)
    return { start, end, length: end - start }
}

/** 计算文件 sha256 */
async function hashFile(filePath: string) {
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(filePath)) {
        hash.update(chunk)
    }

    return hash.digest('hex')
}

/** 分块下载并校验 */
export async function downloadFile({
    url,
    size,
    sha256,
    targetPath,
    onProgress
}: IDownloadOptions) {
    if (!sha256) {
        throw new Error('下载文件缺少校验信息，已终止下载')
    }

    const partPath = `${targetPath}.part`
    const statePath = `${partPath}.json`
    const blockCount = Math.ceil(size / DOWNLOAD_BLOCK_SIZE)

    /** 创建分块状态 */
    function createPartState(): IPartState {
        rmSync(partPath, { force: true })
        writeFileSync(partPath, '')
        truncateSync(partPath, size)
        const nextState: IPartState = {
            size,
            received: Array.from({ length: blockCount }).fill(0) as number[]
        }
        writeFileSync(statePath, JSON.stringify(nextState))
        return nextState
    }

    /** 读取断点状态 */
    function readPartState(): IPartState | null {
        try {
            const saved = JSON.parse(readFileSync(statePath, 'utf8')) as IPartState
            if (saved.size === size && statSync(partPath).size === size) {
                return saved
            }
        } catch {}

        return null
    }

    const state = readPartState() ?? createPartState()
    let lastEmitTime = 0
    let lastSaveTime = Date.now()

    /** 保存断点状态 */
    function saveState() {
        try {
            writeFileSync(statePath, JSON.stringify(state))
        } catch {}
    }

    /** 汇总并推送进度 */
    function emitProgress(force = false) {
        const now = Date.now()
        if (!force && now - lastEmitTime < 200) return
        lastEmitTime = now

        onProgress?.(state.received.reduce((sum, value) => sum + value, 0))
        if (now - lastSaveTime >= 2000) {
            lastSaveTime = now
            saveState()
        }
    }

    /** 下载单个分块 */
    async function downloadBlock(index: number) {
        const { start, end } = getBlockRange(index, size)
        const offset = start + (state.received[index] ?? 0)
        if (offset >= end) return

        const response = await net.fetch(url, {
            redirect: 'follow',
            headers: { Range: `bytes=${offset}-${end - 1}` },
            signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT)
        })
        if (response.status !== 206 || !response.body) {
            throw new Error(`分块下载失败（${response.status}）`)
        }

        const file = createWriteStream(partPath, { flags: 'r+', start: offset })
        const reader = response.body.getReader()

        try {
            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                if (!file.write(value)) {
                    await once(file, 'drain')
                }
                state.received[index] = (state.received[index] ?? 0) + value.byteLength
                emitProgress()
            }
        } finally {
            file.end()
            // 等待文件句柄释放
            await finished(file).catch(() => {})
        }
    }

    /** 下载分块并重试 */
    async function downloadBlockWithRetry(index: number) {
        let lastError: unknown = null
        for (let attempt = 0; attempt <= MAX_DOWNLOAD_RETRIES; attempt++) {
            if (attempt > 0) {
                await new Promise((resolve) => setTimeout(resolve, 2000 * attempt))
            }
            try {
                await downloadBlock(index)
                return
            } catch (error) {
                lastError = error
            }
        }

        throw lastError instanceof Error ? lastError : new Error(String(lastError))
    }

    // 只调度未完成的分块
    const tasks: (() => Promise<void>)[] = []
    for (let index = 0; index < blockCount; index++) {
        const { length } = getBlockRange(index, size)
        if ((state.received[index] ?? 0) < length) {
            tasks.push(() => downloadBlockWithRetry(index))
        }
    }

    // 推送断点进度
    emitProgress(true)

    try {
        await runWithConcurrency(tasks, DOWNLOAD_CONNECTIONS)
    } catch (error) {
        saveState()
        throw error
    }

    saveState()
    onProgress?.(size)

    if ((await hashFile(partPath)) !== sha256) {
        rmSync(partPath, { force: true })
        rmSync(statePath, { force: true })
        throw new Error('文件校验失败，请重新下载')
    }

    renameSync(partPath, targetPath)
    rmSync(statePath, { force: true })
    return targetPath
}
