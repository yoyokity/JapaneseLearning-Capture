import type { ISubtitleSource } from '../src/main/subtitle/sources'

import { execFile, execFileSync } from 'node:child_process'
import {
    closeSync,
    cpSync,
    existsSync,
    mkdirSync,
    openSync,
    readFileSync,
    renameSync,
    rmSync,
    statSync,
    writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { path7za } from '7zip-bin'

import { findFile, HUGGINGFACE_ENDPOINT, SUBTITLE_SOURCES } from '../src/main/subtitle/sources'
import {
    DOWNLOAD_BLOCK_SIZE,
    DOWNLOAD_CONNECTIONS,
    runWithConcurrency
} from '../src/main/utils/download/shared'

/** 项目根目录 */
const root = fileURLToPath(new URL('..', import.meta.url))
/** Hugging Face 地址，可通过 HF_ENDPOINT 使用镜像 */
const { HF_ENDPOINT: hfEndpoint = HUGGINGFACE_ENDPOINT } = process.env
/** 异步执行命令 */
const execFileAsync = promisify(execFile)

/**
 * 下载单个分块
 * @param url 下载地址
 * @param partPath 分块文件路径前缀
 * @param start 起始字节
 * @param end 结束字节（不含）
 */
async function downloadBlock(url: string, partPath: string, start: number, end: number) {
    const blockPath = `${partPath}.${start}`
    const size = end - start
    if (existsSync(blockPath) && statSync(blockPath).size === size) return

    let lastError: unknown = null
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            await execFileAsync('curl', [
                '-sSL',
                '--fail',
                '--range',
                `${start}-${end - 1}`,
                '-o',
                blockPath,
                url
            ])
            if (existsSync(blockPath) && statSync(blockPath).size === size) return
        } catch (error) {
            lastError = error
        }
    }

    throw lastError instanceof Error ? lastError : new Error(`分块下载失败：${blockPath}`)
}

/**
 * 分块下载文件，支持断点续传
 * @param url 下载地址
 * @param target 目标路径
 * @param size 文件大小
 */
async function download(url: string, target: string, size: number) {
    if (existsSync(target) && statSync(target).size === size) return

    mkdirSync(dirname(target), { recursive: true })
    const partPath = `${target}.part`
    const blocks: { start: number; end: number }[] = []
    for (let start = 0; start < size; start += DOWNLOAD_BLOCK_SIZE) {
        blocks.push({ start, end: Math.min(start + DOWNLOAD_BLOCK_SIZE, size) })
    }

    let finished = 0
    console.log(`下载：${url}`)
    const tasks = blocks.map((block) => async () => {
        await downloadBlock(url, partPath, block.start, block.end)
        finished++
        if (finished % 10 === 0 || finished === blocks.length) {
            console.log(`进度：${finished}/${blocks.length}`)
        }
    })
    await runWithConcurrency(tasks, DOWNLOAD_CONNECTIONS)

    // 按顺序合并分块
    const fd = openSync(partPath, 'w')
    try {
        for (const block of blocks) {
            writeFileSync(fd, readFileSync(`${partPath}.${block.start}`))
        }
    } finally {
        closeSync(fd)
    }

    if (statSync(partPath).size !== size) {
        throw new Error(`文件大小不匹配：${target}`)
    }

    renameSync(partPath, target)
    for (const block of blocks) {
        rmSync(`${partPath}.${block.start}`, { force: true })
    }
}

/**
 * 下载并解压 CrispASR 运行时
 * @param source 源文件
 * @param url 下载地址
 */
async function fetchRuntime(source: ISubtitleSource, url: string) {
    const runtimeDir = join(root, 'tools', source.component, source.target)
    if (existsSync(join(runtimeDir, 'crispasr.exe'))) return

    const archivePath = join(root, 'tools', `.${basename(new URL(source.url).pathname)}`)
    await download(url, archivePath, source.size)

    const tempDir = join(tmpdir(), `JapLC-crispasr-${Date.now()}`)
    mkdirSync(tempDir, { recursive: true })
    try {
        execFileSync(path7za, ['x', '-y', `-o${tempDir}`, archivePath], { stdio: 'inherit' })

        const exePath = findFile(tempDir, 'crispasr.exe')
        if (!exePath) throw new Error('压缩包中未找到 crispasr.exe')

        mkdirSync(runtimeDir, { recursive: true })
        cpSync(dirname(exePath), runtimeDir, { recursive: true })
    } finally {
        rmSync(tempDir, { recursive: true, force: true })
        rmSync(archivePath, { force: true })
    }
}

for (const source of SUBTITLE_SOURCES) {
    const url = source.url.replace(HUGGINGFACE_ENDPOINT, hfEndpoint)
    if (source.archive) {
        await fetchRuntime(source, url)
    } else {
        await download(url, join(root, 'tools', source.component, source.target), source.size)
    }
}
