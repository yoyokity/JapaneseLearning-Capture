import type { IAgentMessage, IAgentResult } from '../agent'
import type { ISegment, ISubtitleLlm, SubtitleLanguage } from './types'

import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tool } from 'ai'
import { z } from 'zod'

import { chat, isAgentSuccess } from '../agent'
import { appPath } from '../globalStates'
import { writeLog } from '../services/log'
import { formatSrtTimestamp, MAX_CUE_MS, parseSrtTimestamp, renderSrt } from './cue'

/** 语言名称 */
const LANGUAGE_NAMES: Record<SubtitleLanguage, string> = {
    ja: '日语',
    en: '英语',
    zh: '中文',
    ko: '韩语'
}
/** 过短字幕阈值（毫秒） */
const TRANSLATE_MIN_CUE_MS = 500
/** 工具调用串行执行 */
const AI_TOOL_CONCURRENCY = 1
/** 词时间返回上限 */
const WORD_TIMING_MAX_RESULTS = 2000

const SRT_CUE_PATTERN = /\d+\s*\n\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}\s*\n.*\S/

type AsrJson = ReturnType<typeof buildAsrJson>

interface IWordTimingInput {
    from: string
    to: string
}

interface IWordTimingWord {
    i: number
    text: string
    from: string
    to: string
}

type WordTimingOutput =
    | { ok: true; total: number; words: IWordTimingWord[]; truncated?: boolean }
    | { ok: false; error: string }

/** 构造翻译提示词 */
function buildTranslateSystemPrompt(language: SubtitleLanguage, fileName: string) {
    return [
        `你是专业的${LANGUAGE_NAMES[language]}→简体中文字幕翻译。沙箱中有一个未经加工的原始字幕文件 ${fileName}，内容来自语音识别的分段结果。`,
        '',
        '工作方式：',
        `- 必须先用 read_file 读取 ${fileName}，再修改。`,
        '- 用 get_word_timings 按当前字幕行的时间范围查询词级时间，参数是 SRT 时间戳，例如 00:01:23,456。',
        `- 用 edit_file 直接修改 ${fileName}；不要创建新文件。`,
        '- 可以合并、拆分字幕行；时间轴必须来自词级时间或原时间轴，不能凭空编造。',
        '- 删除或合并后重新编号，保持序号连续。',
        '- 修改后必须保持合法 SRT：序号、时间轴、文本三段结构完整。',
        '- edit_file 的 old_string 必须唯一；同一文本出现多处时，带上序号、时间轴或相邻行作为上下文。',
        '- 文件内容就是最终交付，不要在回复里粘贴，也不要用 markdown 代码块。',
        '- 文件较大时用 read_file 的 offset/limit 分段读取，分批 edit_file。',
        '',
        '翻译规则：',
        '- 修正明显的识别错误，按语义和停顿整理字幕行，再翻译成简体中文。',
        '- 每行尽量是一个完整句或自然断句；不要把同一句拆成两行，也不要把两句话硬合成一行。',
        `- 每行时长不超过 ${MAX_CUE_MS / 1000} 秒，过长请拆成多行。`,
        `- 时长低于 ${TRANSLATE_MIN_CUE_MS} 毫秒、内容一闪而过的行，直接删除该条字幕。`,
        '- 明显是很长的乱码、重复噪声或无法翻译的行，直接删除该条字幕。',
        '- 保持人名、术语和语气一致。',
        '- 句末不要加句号。',
        '- 男性生殖器统一译为「肉棒」，女性生殖器统一译为「小穴」。',
        '',
        '完成后只回复一句简短确认，不要粘贴文件内容。'
    ].join('\n')
}

/** 构造识别 JSON */
function buildAsrJson(segments: ISegment[], modelPath: string, language: SubtitleLanguage) {
    let wordIndex = 0

    return {
        crispasr: {
            backend: 'cohere',
            model: modelPath,
            language
        },
        transcription: segments.map((segment) => ({
            timestamps: segment.timestamps,
            offsets: { from: segment.from, to: segment.to },
            text: segment.text,
            chunk_id: segment.chunkId,
            words: segment.words.map((word) => ({
                i: wordIndex++,
                text: word.text,
                from: word.from,
                to: word.to
            }))
        }))
    }
}

/** 词时间查询工具 */
function createWordTimingTool(asrJson: AsrJson) {
    const words = asrJson.transcription.flatMap((segment) => segment.words)

    return tool<IWordTimingInput, WordTimingOutput, Record<string, unknown>>({
        description:
            '查询 ASR 词级时间。传入 SRT 时间范围，只返回该范围内的词；返回的时间为 SRT 格式，可直接用于编辑字幕。',
        inputSchema: z.object({
            from: z.string().describe('SRT 起始时间，例如 00:01:23,456'),
            to: z.string().describe('SRT 结束时间，例如 00:01:25,000')
        }),
        execute: ({ from, to }) => {
            const fromMs = parseSrtTimestamp(from)
            const toMs = parseSrtTimestamp(to)

            if (fromMs === null) return { ok: false, error: `无效的 SRT 时间：${from}` }
            if (toMs === null) return { ok: false, error: `无效的 SRT 时间：${to}` }
            if (toMs < fromMs) return { ok: false, error: '`to` 必须大于或等于 `from`' }

            const selected = words.filter((word) => word.to >= fromMs && word.from <= toMs)

            return {
                ok: true,
                total: selected.length,
                words: selected.slice(0, WORD_TIMING_MAX_RESULTS).map((word) => ({
                    i: word.i,
                    text: word.text,
                    from: formatSrtTimestamp(word.from),
                    to: formatSrtTimestamp(word.to)
                })),
                ...(selected.length > WORD_TIMING_MAX_RESULTS ? { truncated: true } : {})
            }
        },
        toModelOutput: ({ output }) => ({
            type: 'text' as const,
            value: JSON.stringify(output)
        })
    })
}

/** AI 翻译字幕 */
export async function translateSegments(
    segments: ISegment[],
    modelPath: string,
    language: SubtitleLanguage,
    llm: ISubtitleLlm,
    signal: AbortSignal
): Promise<string | null> {
    if (signal.aborted || !segments.length) return null

    const asrJson = buildAsrJson(segments, modelPath, language)
    const initialSrt = renderSrt(
        asrJson.transcription
            .filter((segment) => segment.text.trim())
            .map((segment, index) => ({
                id: `c${index}`,
                from: segment.offsets.from,
                to: segment.offsets.to,
                text: segment.text
            }))
    )
    if (!initialSrt) return null

    mkdirSync(appPath.sandbox, { recursive: true })

    const fileName = `subtitle-${randomUUID()}.srt`
    const sandboxPath = join(appPath.sandbox, fileName)
    writeFileSync(sandboxPath, initialSrt, 'utf8')

    const cleanup = () => rmSync(sandboxPath, { force: true })
    const system = buildTranslateSystemPrompt(language, fileName)
    const messages: IAgentMessage[] = [
        {
            role: 'user',
            content: `请读取并翻译沙箱中的 ${fileName}。完成后只回复一句简短确认。`
        }
    ]
    const tools = { get_word_timings: createWordTimingTool(asrJson) }
    const maxSteps = Math.min(300, Math.max(30, asrJson.transcription.length * 2))

    let result: IAgentResult
    try {
        result = await chat({
            config: llm,
            messages,
            system,
            tools,
            maxSteps,
            toolCallConcurrency: AI_TOOL_CONCURRENCY,
            source: 'subtitle',
            signal
        })
    } catch (error) {
        if (!signal.aborted) {
            writeLog('error', '[字幕生成] AI编辑字幕失败：', String(error))
        }
        cleanup()
        return null
    }

    if (signal.aborted) {
        cleanup()
        return null
    }

    if (!isAgentSuccess(result.finishReason)) {
        writeLog('error', '[字幕生成] AI编辑字幕失败：', result.error ?? result.finishReason)
        cleanup()
        return null
    }

    if (!existsSync(sandboxPath)) {
        writeLog('error', '[字幕生成] AI未生成 SRT 文件')
        return null
    }

    const srt = readFileSync(sandboxPath, 'utf8')
    if (!SRT_CUE_PATTERN.test(srt)) {
        writeLog('error', '[字幕生成] AI生成的 SRT 格式非法')
        cleanup()
        return null
    }

    if (srt.replaceAll('\r\n', '\n') === initialSrt && language !== 'zh') {
        writeLog('warn', '[字幕生成] AI未修改 SRT')
        cleanup()
        return null
    }

    return sandboxPath
}
