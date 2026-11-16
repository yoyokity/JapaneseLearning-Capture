import type { Buffer } from 'node:buffer'
import type { ChildProcess } from 'node:child_process'
import type { ISegment, IWord, SubtitleLanguage } from './types'

import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { writeLog } from '../ipc/filesystem'

/** 显存或内存不足的特征文本 */
const OUT_OF_MEMORY_PATTERN = /out of memory|out_of_memory|bad_alloc/i
/** 对齐塌缩判定：单个词超过该时长（毫秒） */
const LONG_WORD_MS = 3000
/** 对齐塌缩判定：零长度词占比 */
const ZERO_LENGTH_RATIO = 0.2

interface IRawWord {
    text?: string
    offsets?: { from?: number; to?: number }
    t0?: number
    t1?: number
}

/**
 * 调用 crispasr 生成逐字 JSON
 */
export function runCrispasr(
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
        let outOfMemory = false
        const append = (chunk: Buffer) => {
            const text = chunk.toString()
            // 逐个分块检测，避免特征文本被尾部截断
            if (!outOfMemory && OUT_OF_MEMORY_PATTERN.test(output + text)) {
                outOfMemory = true
            }
            output = (output + text).slice(-2000)
        }
        child.stdout.on('data', append)
        child.stderr.on('data', append)

        child.on('error', reject)
        child.on('close', (code) => {
            if (code === 0) {
                resolve()
                return
            }
            writeLog('error', '[字幕生成] 语音识别失败：', output)
            if (outOfMemory) {
                reject(new Error('语音识别失败：显存或内存不足，请关闭占用较大的程序后重试'))
                return
            }
            reject(new Error('语音识别失败，详见日志'))
        })
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
 * 转为词
 * @param raw 原始词
 */
function toWord(raw: IRawWord): IWord | null {
    const text = String(raw.text ?? '')
    if (!text.trim()) return null

    const from = Number(raw.offsets?.from ?? Number(raw.t0 ?? 0) * 10)
    const to = Number(raw.offsets?.to ?? Number(raw.t1 ?? 0) * 10)

    return { text, from: Number.isFinite(from) ? from : 0, to: Number.isFinite(to) ? to : 0 }
}

/**
 * 词级时间是否对齐塌缩
 * @param words 词列表
 */
function isCollapsed(words: IWord[]) {
    if (!words.length) return false

    const zeroLength = words.filter((word) => word.to <= word.from).length

    return (
        words.some((word) => word.to - word.from > LONG_WORD_MS) ||
        zeroLength / words.length > ZERO_LENGTH_RATIO
    )
}

/**
 * 用 token 级时间重建词
 * @param tokens 原始 token
 * @param language 识别语言
 * @param segmentEnd 段结束时间
 * @remark token 时间不能超出 ASR 段边界
 */
function tokensToWords(tokens: IRawWord[], language: SubtitleLanguage, segmentEnd: number | null) {
    const words: IWord[] = []

    for (const token of tokens) {
        const text = String(token.text ?? '')
        if (!text.trim()) continue

        const from = Number(token.offsets?.from ?? Number(token.t0 ?? 0) * 10)
        const to = Number(token.offsets?.to ?? Number(token.t1 ?? 0) * 10)
        const start = Number.isFinite(from) ? from : 0
        const end = Number.isFinite(to) ? to : start
        const safeEnd = segmentEnd === null ? end : Math.max(start, Math.min(end, segmentEnd))

        if (language === 'en') {
            const previous = words.at(-1)
            if (previous && !/^\s/u.test(text)) {
                previous.text += text
                previous.to = Math.max(previous.to, safeEnd)
                continue
            }
            words.push({ text: text.trim(), from: start, to: safeEnd })
            continue
        }

        words.push({ text: text.trim(), from: start, to: safeEnd })
    }

    return words
}

/**
 * 解析 crispasr 的 json-full 结果
 * @param jsonPath JSON 路径
 * @param language 识别语言
 * @remark 对齐塌缩时改用 tokens 的时间
 */
export function parseSegments(jsonPath: string, language: SubtitleLanguage): ISegment[] {
    const raw = JSON.parse(readFileSync(jsonPath, 'utf8')) as {
        transcription?: {
            text?: string
            offsets?: { from?: number; to?: number }
            timestamps?: { from?: string; to?: string }
            chunk_id?: number
            words?: IRawWord[]
            tokens?: IRawWord[]
        }[]
    }
    if (!Array.isArray(raw.transcription)) {
        throw new TypeError('识别结果缺少 transcription')
    }

    return raw.transcription.flatMap((segment) => {
        const rawWords = (segment.words ?? []).flatMap((word) => {
            const parsed = toWord(word)
            return parsed ? [parsed] : []
        })
        const segmentEnd = Number(segment.offsets?.to)
        const tokens = tokensToWords(
            segment.tokens ?? [],
            language,
            Number.isFinite(segmentEnd) ? segmentEnd : null
        )
        const words =
            (isCollapsed(rawWords) || !rawWords.length) && tokens.length ? tokens : rawWords
        const text = String(segment.text ?? '').trim()
        const chunkId = Number.isInteger(segment.chunk_id) ? segment.chunk_id : undefined
        const timestamps =
            segment.timestamps?.from && segment.timestamps.to
                ? { from: segment.timestamps.from, to: segment.timestamps.to }
                : undefined

        if (!words.length) {
            // 没有词级时间时退化为整段
            if (!text) return []

            const from = Number(segment.offsets?.from ?? 0)
            const to = Number(segment.offsets?.to ?? from)
            return [
                {
                    chunkId,
                    text,
                    from,
                    to,
                    timestamps,
                    words: [{ text, from, to }]
                }
            ]
        }

        const normalized = normalizeWordTimes(words)
        const from = Number(segment.offsets?.from ?? normalized[0]!.from)
        const to = Number(segment.offsets?.to ?? normalized.at(-1)!.to)

        return [
            {
                chunkId,
                text,
                from,
                to,
                timestamps,
                words: normalized
            }
        ]
    })
}
