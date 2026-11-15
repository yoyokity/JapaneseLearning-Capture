import type { Buffer } from 'node:buffer'
import type { ChildProcess } from 'node:child_process'
import type { IAgentConfig } from '../agent'

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { observable } from '@trpc/server/observable'
import { app } from 'electron'

import { createAgentStream, isAgentSuccess } from '../agent'
import { appPath } from '../globalStates'
import { post } from './net'

export type SubtitleLanguage = 'ja' | 'en' | 'zh' | 'ko'

export type SubtitleStage = 'extract' | 'asr' | 'optimize' | 'translate'

export type ISubtitleLlm = IAgentConfig

export interface IGenerateSubtitleInput {
    /** 视频路径 */
    inputPath: string
    /** 识别语言 */
    language: SubtitleLanguage
    /** 是否 AI 优化 */
    aiOptimize: boolean
    /** AI 优化配置 */
    llm?: ISubtitleLlm | undefined
}

export interface ISubtitleProgress {
    /** 当前阶段 */
    stage: SubtitleStage
    /** 进度 0-1，-1 未知 */
    progress: number
    /** 附加文案 */
    message?: string
    /** 输出文件路径 */
    outputPath?: string
}

interface IWord {
    text: string
    from: number
    to: number
}

interface ISegment {
    words: IWord[]
}

interface ICueDraft {
    from: number
    to: number
    text: string
}

interface ICue extends ICueDraft {
    id: string
    zh?: string
}

interface ISentence {
    from: number
    to: number
    text: string
}

/** 单条字幕最大字数 */
const MAX_CUE_CHARS = 24
/** 单条字幕最大时长（毫秒） */
const MAX_CUE_MS = 8000
/** 语言名称 */
const LANGUAGE_NAMES: Record<SubtitleLanguage, string> = {
    ja: '日语',
    en: '英语',
    zh: '中文',
    ko: '韩语'
}

/**
 * 获取依赖程序与模型路径
 */
function getSubtitlePaths() {
    const toolsDir = join(appPath.extraResource, 'tools')

    return {
        crispasr: join(toolsDir, 'subtitle/runtimes/windows-x64/cuda/bin/crispasr.exe'),
        model: join(toolsDir, 'subtitle-cohere/cohere-transcribe-q6_k.gguf'),
        aligner: join(toolsDir, 'subtitle/models/qwen3-forced-aligner.gguf'),
        vad: join(toolsDir, 'subtitle/models/vad/whisper-vad-asmr-q4_k.gguf')
    }
}

/**
 * 路径是否全为 ASCII
 * @param value 路径
 * @remark crispasr 无法读取非 ASCII 路径
 */
function isAsciiPath(value: string) {
    return /^[\x20-\x7E]*$/.test(value)
}

/**
 * 延迟
 * @param ms 毫秒
 */
function delay(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

/**
 * 终止进程树
 * @param child 子进程
 * @remark crispasr 会派生子进程
 */
function killProcessTree(child: ChildProcess | null) {
    if (!child?.pid) return

    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
}

/**
 * 提取 16k 单声道音频
 * @param ffmpegPath ffmpeg 路径
 * @param inputPath 输入路径
 * @param outputPath 输出路径
 * @param onProgress 进度回调
 * @param onChild 子进程回调
 */
function extractAudio(
    ffmpegPath: string,
    inputPath: string,
    outputPath: string,
    onProgress: (progress: number) => void,
    onChild: (child: ChildProcess) => void
) {
    return new Promise<void>((resolve, reject) => {
        const child = spawn(
            ffmpegPath,
            [
                '-hide_banner',
                '-nostdin',
                '-y',
                '-i',
                inputPath,
                '-map',
                '0:a:0',
                '-vn',
                '-ac',
                '1',
                '-ar',
                '16000',
                '-c:a',
                'pcm_s16le',
                outputPath
            ],
            { windowsHide: true }
        )
        onChild(child)

        let pendingText = ''
        let totalDuration: number | null = null
        let lastTime = 0

        child.stderr.on('data', (chunk: Buffer) => {
            pendingText += chunk.toString()

            const durationMatch = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(pendingText)
            if (durationMatch) {
                const [, h, m, s] = durationMatch
                const duration = Number(h) * 3600 + Number(m) * 60 + Number(s)
                if (duration > 0) totalDuration = duration
            }

            const matches = [...pendingText.matchAll(/time=\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/g)]
            const lastMatch = matches.at(-1)
            if (lastMatch) {
                const [, h, m, s] = lastMatch
                const time = Number(h) * 3600 + Number(m) * 60 + Number(s)
                if (time !== lastTime) {
                    lastTime = time
                    onProgress(totalDuration ? Math.min(time / totalDuration, 1) : -1)
                }
            }

            if (pendingText.length > 128) {
                pendingText = pendingText.slice(-64)
            }
        })

        child.on('error', reject)
        child.on('close', (code) => {
            if (code === 0) {
                resolve()
                return
            }
            reject(new Error(`提取音频失败：${pendingText.slice(-500)}`))
        })
    })
}

/**
 * 调用 crispasr 生成逐字 JSON
 */
function runCrispasr(
    options: {
        crispasrPath: string
        workDir: string
        modelPath: string
        alignerPath: string
        vadPath: string
        language: SubtitleLanguage
    },
    onChild: (child: ChildProcess) => void
) {
    return new Promise<void>((resolve, reject) => {
        const child = spawn(
            options.crispasrPath,
            [
                '--backend',
                'cohere',
                '-m',
                options.modelPath,
                '-f',
                'audio.wav',
                '--vad',
                '-vm',
                options.vadPath,
                '-am',
                options.alignerPath,
                '--force-aligner',
                '-l',
                options.language,
                '--split-on-punct',
                '-of',
                join('out', 'result'),
                '-ojf'
            ],
            {
                cwd: options.workDir,
                windowsHide: true,
                env: { ...process.env, GGML_CUDA_DISABLE_GRAPHS: '1' }
            }
        )
        onChild(child)

        let output = ''
        const append = (chunk: Buffer) => {
            output = (output + chunk.toString()).slice(-2000)
        }
        child.stdout.on('data', append)
        child.stderr.on('data', append)

        child.on('error', reject)
        child.on('close', (code) => {
            if (code === 0) {
                resolve()
                return
            }
            reject(new Error(`语音识别失败：${output}`))
        })
    })
}

/**
 * 解析 crispasr 的 json-full 结果
 * @param jsonPath JSON 路径
 */
function parseSegments(jsonPath: string): ISegment[] {
    const raw = JSON.parse(readFileSync(jsonPath, 'utf8')) as {
        transcription?: {
            text?: string
            offsets?: { from?: number; to?: number }
            words?: {
                text?: string
                offsets?: { from?: number; to?: number }
                t0?: number
                t1?: number
            }[]
        }[]
    }
    if (!Array.isArray(raw.transcription)) {
        throw new TypeError('识别结果缺少 transcription')
    }

    return raw.transcription.flatMap((segment) => {
        const words = (segment.words ?? []).flatMap((word) => {
            const text = String(word.text ?? '')
            if (!text) return []

            const from = Number(word.offsets?.from ?? Number(word.t0 ?? 0) * 10)
            const to = Number(word.offsets?.to ?? Number(word.t1 ?? 0) * 10)
            return [
                { text, from: Number.isFinite(from) ? from : 0, to: Number.isFinite(to) ? to : 0 }
            ]
        })
        if (words.length) return [{ words: normalizeWordTimes(words) }]

        // 没有词级时间时退化为整段
        const text = String(segment.text ?? '').trim()
        if (!text) return []

        const from = Number(segment.offsets?.from ?? 0)
        const to = Number(segment.offsets?.to ?? from)
        return [{ words: [{ text, from, to }] }]
    })
}

/**
 * 修正词时间
 * @param words 词列表
 * @remark 保证单调递增且有正时长
 */
function normalizeWordTimes(words: IWord[]) {
    let previous = 0

    return words.map((word) => {
        const from = Math.max(word.from, previous)
        const to = Math.max(word.to, from + 40)
        previous = to

        return { text: word.text, from, to }
    })
}

/**
 * 拼接词文本
 * @param words 词列表
 * @param language 识别语言
 */
function joinWordText(words: IWord[], language: SubtitleLanguage) {
    const text = words.map((word) => word.text).join(language === 'en' ? ' ' : '')

    return language === 'en' ? text.replace(/\s+/g, ' ').trim() : text
}

/**
 * 按标点与长度切分字幕
 * @param words 词列表
 * @param language 识别语言
 */
function splitIntoCues(words: IWord[], language: SubtitleLanguage): ICueDraft[] {
    const cues: ICueDraft[] = []
    let bucket: IWord[] = []

    for (const word of words) {
        bucket.push(word)

        const start = bucket[0]!.from
        const text = joinWordText(bucket, language)
        const hardEnd = /[。！？!?]$/u.test(word.text)
        const softEnd = /[，、,;；：:…]$/u.test(word.text) && text.length >= 10

        if (hardEnd || softEnd || text.length >= MAX_CUE_CHARS || word.to - start >= MAX_CUE_MS) {
            cues.push({ from: start, to: word.to, text })
            bucket = []
        }
    }

    if (bucket.length) {
        cues.push({
            from: bucket[0]!.from,
            to: bucket[bucket.length - 1]!.to,
            text: joinWordText(bucket, language)
        })
    }

    return cues.filter((cue) => cue.text.trim())
}

/**
 * 从回复中提取 JSON
 * @param content 回复文本
 */
function extractJson(content: string) {
    const start = content.indexOf('{')
    const end = content.lastIndexOf('}')
    if (start < 0 || end <= start) {
        throw new Error('LLM 返回内容不是 JSON')
    }

    return JSON.parse(content.slice(start, end + 1)) as unknown
}

/**
 * 校验并归一化句子切分
 * @param value 解析结果
 * @param count 词数
 */
function normalizeSentences(value: unknown, count: number): ISentence[] | null {
    const list = (value as { sentences?: unknown })?.sentences
    if (!Array.isArray(list)) return null

    const sentences: ISentence[] = []
    let expected = 0
    for (const item of list) {
        const from = Number((item as ISentence)?.from)
        const to = Number((item as ISentence)?.to)
        const text = String((item as ISentence)?.text ?? '').trim()

        if (!Number.isInteger(from) || !Number.isInteger(to)) return null
        if (from !== expected || to < from || to >= count || !text) return null

        sentences.push({ from, to, text })
        expected = to + 1
    }

    return expected === count ? sentences : null
}

/**
 * 调用 LLM
 * @param prompt 提示词
 * @param llm LLM 配置
 * @param signal 取消信号
 */
function askLlm(prompt: string, llm: ISubtitleLlm, signal: AbortSignal) {
    return new Promise<string>((resolve, reject) => {
        let text = ''
        let settled = false
        let subscription: { unsubscribe: () => void } | null = null

        /**
         * 结束本次调用
         * @param callback 结束回调
         */
        function finish(callback: () => void) {
            if (settled) return

            settled = true
            signal.removeEventListener('abort', onAbort)
            callback()
        }

        /**
         * 取消本次调用
         */
        function onAbort() {
            subscription?.unsubscribe()
            finish(() => reject(new Error('AI流已取消')))
        }

        if (signal.aborted) {
            reject(new Error('AI流已取消'))
            return
        }

        subscription = createAgentStream({ config: llm, prompt }).subscribe({
            next(payload) {
                if (payload.type === 'data') {
                    text += payload.data
                    return
                }

                if (payload.type === 'reset') {
                    text = ''
                    return
                }

                if (payload.type !== 'end') return

                finish(() => {
                    if (!isAgentSuccess(payload.finishReason)) {
                        reject(new Error(`AI生成未完成：${payload.finishReason}`))
                        return
                    }

                    resolve(payload.text || text)
                })
            },
            error(error) {
                finish(() => reject(error))
            },
            complete() {
                finish(() => reject(new Error('AI流未正常结束')))
            }
        })

        signal.addEventListener('abort', onAbort, { once: true })
        if (signal.aborted) onAbort()
    })
}

/**
 * 按并发数执行任务
 * @param tasks 任务列表
 * @param limit 并发数
 */
async function runWithConcurrency(tasks: (() => Promise<void>)[], limit: number) {
    let index = 0
    const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
        while (index < tasks.length) {
            const task = tasks[index++]!
            await task()
        }
    })

    await Promise.all(workers)
}

/**
 * 让 LLM 纠错并切分全部词
 * @param words 全部词
 * @param language 识别语言
 * @param llm LLM 配置
 * @param signal 取消信号
 */
async function correctAll(
    words: IWord[],
    language: SubtitleLanguage,
    llm: ISubtitleLlm,
    signal: AbortSignal
): Promise<ICueDraft[]> {
    const fallback = splitIntoCues(words, language)
    if (words.length < 2) return fallback

    const languageName = LANGUAGE_NAMES[language]
    const wordList = words.map((word, index) => `${index}:${word.text}`).join(' ')
    const prompt = [
        `你是专业的${languageName}字幕校对员。输入是一段 ASR 逐词识别结果，请修正明显的识别错误，并按字幕单元切分。`,
        '',
        '规则：',
        '- 只返回 JSON，不要解释，不要代码块。',
        `- sentences 中 from/to 是词索引（包含两端），必须从 0 连续覆盖到 ${words.length - 1}，不重叠、不遗漏。`,
        `- 每条尽量控制在 ${MAX_CUE_CHARS} 个字符以内，优先在句末标点和助词边界切分。`,
        '',
        '输出格式：{"sentences":[{"from":0,"to":12,"text":"..."}]}',
        '',
        `词表：${wordList}`
    ].join('\n')

    try {
        const sentences = normalizeSentences(
            extractJson(await askLlm(prompt, llm, signal)),
            words.length
        )
        if (!sentences) return fallback

        return sentences.map((sentence) => ({
            from: words[sentence.from]!.from,
            to: words[sentence.to]!.to,
            text: sentence.text.replace(/\s+/g, ' ').trim()
        }))
    } catch {
        // 失败时保留原始切分
        return fallback
    }
}

/**
 * 纠错并切分全部识别段
 * @param segments 识别段
 * @param language 识别语言
 * @param llm LLM 配置
 * @param signal 取消信号
 * @param onProgress 进度回调
 */
async function correctSegments(
    segments: ISegment[],
    language: SubtitleLanguage,
    llm: ISubtitleLlm,
    signal: AbortSignal,
    onProgress: (progress: number) => void
) {
    if (signal.aborted) return []

    const cues = await correctAll(
        segments.flatMap((segment) => segment.words),
        language,
        llm,
        signal
    )
    if (!signal.aborted) onProgress(1)

    return cues
}

/**
 * 用 LLM 翻译字幕
 * @param cues 字幕条
 * @param language 识别语言
 * @param llm LLM 配置
 * @param signal 取消信号
 * @param onProgress 进度回调
 */
async function translateCues(
    cues: ICue[],
    language: SubtitleLanguage,
    llm: ISubtitleLlm,
    signal: AbortSignal,
    onProgress: (progress: number) => void
) {
    if (signal.aborted || !cues.length) return

    const languageName = LANGUAGE_NAMES[language]
    const prompt = [
        `你是专业的${languageName}→简体中文字幕翻译。逐条翻译下面的字幕，保持口语化、贴合语气，不增删信息，不解释。`,
        '',
        '只返回 JSON：{"translations":[{"id":"c0","zh":"..."}]}，必须覆盖每个 id。',
        '- 男性生殖器统一译为「肉棒」，女性生殖器统一译为「小穴」。',
        '',
        cues.map((cue) => JSON.stringify({ id: cue.id, text: cue.text })).join('\n')
    ].join('\n')

    try {
        const value = extractJson(await askLlm(prompt, llm, signal)) as {
            translations?: { id?: string; zh?: string }[]
        }
        const translations = new Map(
            (value.translations ?? []).map((item) => [
                String(item.id ?? ''),
                String(item.zh ?? '')
                    .replace(/\s+/g, ' ')
                    .trim()
            ])
        )
        for (const cue of cues) {
            const zh = translations.get(cue.id)
            if (zh) cue.zh = zh
        }
    } catch {
        // 翻译失败保留原文
    }

    if (!signal.aborted) onProgress(1)
}

/**
 * 谷歌翻译单条文本
 * @param text 文本
 */
async function translateByGoogle(text: string) {
    const searchParams = new URLSearchParams({
        rpcids: 'MkEWBc',
        'source-path': '/',
        hl: 'zh-CN',
        'soc-app': '1',
        'soc-platform': '1',
        'soc-device': '1'
    })
    const url = `https://translate.google.com/_/TranslateWebserverUi/data/batchexecute?${searchParams}`
    const payload = JSON.stringify([
        [['MkEWBc', JSON.stringify([[text, 'auto', 'zh-CN', 1], []]), null, 'generic']]
    ])
    const response = await post(url, `f.req=${encodeURIComponent(payload)}&`, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000
    })
    if (!response.ok) return ''

    try {
        const content = JSON.parse(String(response.body).replace(/^\)\]\}'/, ''))
        const data = JSON.parse(content[0][2]) as { 1: { 0: { 0: { 5: [string][] } } } }
        const phrases = data[1][0][0][5]

        return phrases.map(([value]) => value).join(' ')
    } catch {
        return ''
    }
}

/**
 * 谷歌翻译全部字幕
 * @param cues 字幕条
 * @param signal 取消信号
 * @param onProgress 进度回调
 */
async function translateCuesWithGoogle(
    cues: ICue[],
    signal: AbortSignal,
    onProgress: (progress: number) => void
) {
    let finished = 0
    const tasks = cues.map((cue) => async () => {
        if (signal.aborted) return

        for (let attempt = 0; attempt < 3; attempt++) {
            const zh = await translateByGoogle(cue.text)
            if (zh) {
                cue.zh = zh
                break
            }
            await delay(500)
        }

        finished++
        onProgress(finished / cues.length)
        await delay(300)
    })

    await runWithConcurrency(tasks, 2)
}

/**
 * 格式化 SRT 时间戳
 * @param ms 毫秒
 */
function formatTimestamp(ms: number) {
    const value = Math.max(0, Math.round(ms))
    const hours = Math.floor(value / 3_600_000)
    const minutes = Math.floor((value % 3_600_000) / 60_000)
    const seconds = Math.floor((value % 60_000) / 1000)
    const millis = value % 1000

    return [
        String(hours).padStart(2, '0'),
        String(minutes).padStart(2, '0'),
        `${String(seconds).padStart(2, '0')},${String(millis).padStart(3, '0')}`
    ].join(':')
}

/**
 * 渲染 SRT
 * @param cues 字幕条
 */
function renderSrt(cues: ICue[]) {
    return cues
        .map(
            (cue, index) =>
                `${index + 1}\n${formatTimestamp(cue.from)} --> ${formatTimestamp(cue.to)}\n${cue.zh ?? cue.text}\n`
        )
        .join('\n')
}

/**
 * 创建字幕生成任务
 * @param input 生成参数
 */
export function createSubtitleStream(input: IGenerateSubtitleInput) {
    return observable<ISubtitleProgress>((emit) => {
        let currentChild: ChildProcess | null = null
        let cancelled = false
        const controller = new AbortController()
        const workDir = join(app.getPath('temp'), 'JapLC-subtitle', String(Date.now()))

        const emitProgress = (progress: ISubtitleProgress) => {
            if (!cancelled) emit.next(progress)
        }

        const run = async () => {
            try {
                if (!existsSync(input.inputPath)) {
                    throw new Error('输入文件不存在')
                }
                if (input.aiOptimize && !input.llm) {
                    throw new Error('未配置 AI 翻译引擎，请先在 设置 → 翻译 中配置')
                }

                const paths = getSubtitlePaths()
                const requiredPaths = [paths.crispasr, paths.model, paths.aligner, paths.vad]
                if (requiredPaths.some((path) => !existsSync(path))) {
                    throw new Error('未安装字幕生成依赖，请先在 设置 → 依赖 中下载')
                }
                if (!requiredPaths.every(isAsciiPath)) {
                    throw new Error(
                        '应用安装路径包含非 ASCII 字符，语音识别程序无法读取模型，请安装到纯英文路径'
                    )
                }

                const ffmpegPath = join(appPath.extraResource, 'tools/ffmpeg/ffmpeg.exe')
                if (!existsSync(ffmpegPath)) {
                    throw new Error('未安装 FFmpeg 依赖，请先在 设置 → 依赖 中下载')
                }

                mkdirSync(join(workDir, 'out'), { recursive: true })

                // 1. 提取音频
                emitProgress({ stage: 'extract', progress: 0 })
                await extractAudio(
                    ffmpegPath,
                    input.inputPath,
                    join(workDir, 'audio.wav'),
                    (progress) => emitProgress({ stage: 'extract', progress }),
                    (child) => {
                        currentChild = child
                    }
                )
                if (cancelled) return

                // 2. 语音识别
                emitProgress({ stage: 'asr', progress: -1 })
                await runCrispasr(
                    {
                        crispasrPath: paths.crispasr,
                        workDir,
                        modelPath: paths.model,
                        alignerPath: paths.aligner,
                        vadPath: paths.vad,
                        language: input.language
                    },
                    (child) => {
                        currentChild = child
                    }
                )
                if (cancelled) return

                const resultPath = join(workDir, 'out', 'result.json')
                if (!existsSync(resultPath)) {
                    throw new Error(
                        '语音识别没有生成结果，可能是显存或内存不足，请关闭占用较大的程序后重试'
                    )
                }

                const segments = parseSegments(resultPath)
                if (!segments.length) {
                    throw new Error('未识别到语音内容')
                }

                let cues: ICue[]
                if (input.aiOptimize && input.llm) {
                    // 3. AI 纠错切分
                    emitProgress({ stage: 'optimize', progress: -1, message: '正在纠错与切分' })
                    const drafts = await correctSegments(
                        segments,
                        input.language,
                        input.llm,
                        controller.signal,
                        (progress) => emitProgress({ stage: 'optimize', progress })
                    )
                    cues = drafts.map((cue, index) => ({ ...cue, id: `c${index}` }))

                    // 4. AI 翻译
                    emitProgress({ stage: 'translate', progress: -1, message: '正在翻译' })
                    await translateCues(
                        cues,
                        input.language,
                        input.llm,
                        controller.signal,
                        (progress) => emitProgress({ stage: 'translate', progress })
                    )
                } else {
                    // 3. 直接切分并谷歌翻译
                    cues = segments
                        .flatMap((segment) => splitIntoCues(segment.words, input.language))
                        .map((cue, index) => ({ ...cue, id: `c${index}` }))

                    emitProgress({ stage: 'translate', progress: 0, message: '正在翻译' })
                    await translateCuesWithGoogle(cues, controller.signal, (progress) =>
                        emitProgress({ stage: 'translate', progress })
                    )
                }
                if (cancelled) return

                const outputPath = join(
                    dirname(input.inputPath),
                    `${basename(input.inputPath, extname(input.inputPath))}.zh-CN.srt`
                )
                writeFileSync(outputPath, renderSrt(cues), 'utf8')

                emitProgress({ stage: 'translate', progress: 1, outputPath })
                emit.complete()
            } catch (error) {
                if (!cancelled) {
                    emit.error(error instanceof Error ? error : new TypeError(String(error)))
                }
            } finally {
                rmSync(workDir, { recursive: true, force: true })
            }
        }

        void run()

        return {
            unsubscribe() {
                cancelled = true
                controller.abort()
                killProcessTree(currentChild)
            }
        }
    })
}
