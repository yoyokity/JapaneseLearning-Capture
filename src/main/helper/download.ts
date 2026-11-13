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

/** 下载超时，大包下载不能使用短超时 */
const DOWNLOAD_TIMEOUT = 30 * 60 * 1000
/** 下载中断后的最大重试次数 */
const MAX_DOWNLOAD_RETRIES = 3
/** 分块下载并发数，实测 8 路可跑满带宽 */
const DOWNLOAD_CONNECTIONS = 8
/** 每个分块的大小 */
const DOWNLOAD_BLOCK_SIZE = 8 * 1024 * 1024

/**
 * 分块下载参数
 */
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

/**
 * 分块下载状态，保存在 .part.json 中用于断点续传
 */
interface IPartState {
    /** 文件总大小 */
    size: number
    /** 每块已写入字节数 */
    received: number[]
}

/**
 * 获取分块的范围
 * @param index 分块下标
 * @param size 文件总大小
 */
function getBlockRange(index: number, size: number) {
    const start = index * DOWNLOAD_BLOCK_SIZE
    const end = Math.min(start + DOWNLOAD_BLOCK_SIZE, size)
    return { start, end, length: end - start }
}

/**
 * 计算文件的 sha256
 */
async function hashFile(filePath: string) {
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(filePath)) {
        hash.update(chunk)
    }

    return hash.digest('hex')
}

/**
 * 分块下载文件，支持断点续传与 sha256 校验
 * @returns 下载完成的文件路径
 */
export async function downloadFile({
    url,
    size,
    sha256,
    targetPath,
    onProgress
}: IDownloadOptions) {
    if (!sha256) {
        throw new Error('更新包缺少校验信息，已终止更新')
    }

    const partPath = `${targetPath}.part`
    const statePath = `${partPath}.json`
    const blockCount = Math.ceil(size / DOWNLOAD_BLOCK_SIZE)

    /**
     * 创建全新的分块状态，预分配文件
     */
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

    /**
     * 读取上次未完成的分块状态，文件大小不一致时返回 null
     */
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

    /**
     * 保存断点状态
     */
    function saveState() {
        try {
            writeFileSync(statePath, JSON.stringify(state))
        } catch {}
    }

    /**
     * 汇总各分块进度并推送
     */
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

    /**
     * 下载单个分块，从该块已写入位置继续
     */
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
            // 等文件句柄释放后再继续，避免 Windows 上文件被占用
            await finished(file).catch(() => {})
        }
    }

    /**
     * 下载分块并重试
     */
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

    // 只调度未完成的分块，多个 worker 并发领取
    const pendingBlocks: number[] = []
    for (let index = 0; index < blockCount; index++) {
        const { length } = getBlockRange(index, size)
        if ((state.received[index] ?? 0) < length) {
            pendingBlocks.push(index)
        }
    }

    // 立即推送断点续传的进度，避免界面上重新从 0 开始
    emitProgress(true)

    try {
        await Promise.all(
            Array.from(
                { length: Math.min(DOWNLOAD_CONNECTIONS, pendingBlocks.length) },
                async () => {
                    while (pendingBlocks.length > 0) {
                        const index = pendingBlocks.shift()
                        if (index === undefined) break
                        await downloadBlockWithRetry(index)
                    }
                }
            )
        )
    } catch (error) {
        saveState()
        throw error
    }

    saveState()
    onProgress?.(size)

    if ((await hashFile(partPath)) !== sha256) {
        rmSync(partPath, { force: true })
        rmSync(statePath, { force: true })
        throw new Error('更新包校验失败，请重新下载')
    }

    renameSync(partPath, targetPath)
    rmSync(statePath, { force: true })
    return targetPath
}
