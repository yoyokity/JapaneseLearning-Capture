import { execFile, execFileSync } from 'node:child_process'
import {
    closeSync,
    cpSync,
    existsSync,
    mkdirSync,
    openSync,
    readdirSync,
    readFileSync,
    renameSync,
    rmSync,
    statSync,
    writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { path7za } from '7zip-bin'

import {
    DOWNLOAD_BLOCK_SIZE,
    DOWNLOAD_CONNECTIONS,
    runWithConcurrency
} from '../src/main/helper/downloadShared'

/** 项目根目录 */
const root = fileURLToPath(new URL('..', import.meta.url))
/** Hugging Face 地址，可通过 HF_ENDPOINT 使用镜像 */
const { HF_ENDPOINT: hfEndpoint = 'https://huggingface.co' } = process.env
/** 运行时对应的 CrispASR 版本 */
const CRISPASR_VERSION = 'v0.8.53'
/** CrispASR CUDA 包大小 */
const CRISPASR_ARCHIVE_SIZE = 787_539_468
/** 异步执行命令 */
const execFileAsync = promisify(execFile)

/** 待下载的模型 */
const models = [
    {
        url: `${hfEndpoint}/cstr/cohere-transcribe-03-2026-GGUF/resolve/main/cohere-transcribe-q6_k.gguf`,
        target: join(root, 'tools/subtitle-cohere/cohere-transcribe-q6_k.gguf'),
        size: 1_981_355_904
    },
    {
        url: `${hfEndpoint}/cstr/qwen3-forced-aligner-0.6b-GGUF/resolve/main/qwen3-forced-aligner-0.6b-q4_k.gguf`,
        target: join(root, 'tools/subtitle/models/qwen3-forced-aligner.gguf'),
        size: 529_001_216
    },
    {
        url: `${hfEndpoint}/cstr/whisper-vad-encdec-asmr-GGUF/resolve/main/whisper-vad-asmr-q4_k.gguf`,
        target: join(root, 'tools/subtitle/models/vad/whisper-vad-asmr-q4_k.gguf'),
        size: 25_418_080
    }
]

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
 * 递归查找文件
 * @param dir 目录
 * @param name 文件名
 */
function findFile(dir: string, name: string): string | null {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = join(dir, entry.name)
        if (entry.isDirectory()) {
            const found = findFile(fullPath, name)
            if (found) return found
        } else if (entry.name === name) {
            return fullPath
        }
    }

    return null
}

/**
 * 下载并解压 CrispASR 运行时
 */
async function fetchRuntime() {
    const runtimeDir = join(root, 'tools/subtitle/runtimes/windows-x64/cuda/bin')
    if (existsSync(join(runtimeDir, 'crispasr.exe'))) return

    const url = `https://github.com/CrispStrobe/CrispASR/releases/download/${CRISPASR_VERSION}/crispasr-windows-x86_64-cuda.zip`
    const archivePath = join(root, 'tools/.crispasr-windows-x86_64-cuda.zip')
    await download(url, archivePath, CRISPASR_ARCHIVE_SIZE)

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

for (const model of models) {
    await download(model.url, model.target, model.size)
}
await fetchRuntime()
