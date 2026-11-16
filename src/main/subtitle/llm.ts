import type { IAgentMessage, IAgentResult } from '../agent'
import type { ICue, ISegment, ISubtitleLlm, IWord, SubtitleLanguage } from './types'

import { chat, createTools, isAgentSuccess } from '../agent'
import { writeLog } from '../ipc/filesystem'
import { MAX_CUE_MS, splitIntoCues } from './cue'

/** 语言名称 */
const LANGUAGE_NAMES: Record<SubtitleLanguage, string> = {
    ja: '日语',
    en: '英语',
    zh: '中文',
    ko: '韩语'
}
/** 过短字幕阈值（毫秒） */
const TRANSLATE_MIN_CUE_MS = 500
/** 工具最大并发数 */
const AI_TOOL_CONCURRENCY = 8

/**
 * 是否为成功的 AI 调用
 * @param result AI 结果
 * @remark 带工具调用时以 tool-calls 结束也算成功
 */
function isChatSuccess(result: IAgentResult) {
    return isAgentSuccess(result.finishReason) || result.finishReason === 'tool-calls'
}

/** 已提交的字幕范围 */
interface ISubmittedRange {
    fromWord: number
    toWord: number
    zh: string
}

/**
 * 构造翻译系统提示词
 * @param language 识别语言
 */
function buildTranslateSystemPrompt(language: SubtitleLanguage) {
    return [
        `你是专业的${LANGUAGE_NAMES[language]}→简体中文字幕翻译。下面给出完整的 crispasr 识别结果，包含段级信息（timestamps/offsets/text/chunk_id）和逐词信息（words：text/from/to）。chunk_id 只是 ASR 分段提示，不是硬性断句。`,
        '',
        '请修正明显的识别错误，按语义和停顿把词组合成最终字幕行，再翻译成简体中文。',
        '',
        '规则：',
        '- 必须调用 commit_subtitle 提交最终字幕行。',
        '- words 里的 i 是全局词索引，fromWord/toWord 使用这个索引。',
        '- fromWord/toWord 是全局词索引（包含两端），必须完整覆盖所有 words，不能重叠、遗漏。',
        '- 可以跨 chunk_id 合并，也可以在 chunk 内部拆分。',
        '- 每行尽量是一个完整句或自然断句；不要把同一句拆成两行，也不要把两句话硬合成一行。',
        `- 每行时长不超过 ${MAX_CUE_MS / 1000} 秒，过长请拆成多行。`,
        `- 时长低于 ${TRANSLATE_MIN_CUE_MS} 毫秒、内容一闪而过的行，zh 传空字符串删除。`,
        '- 明显是很长的乱码、重复噪声或无法翻译的行，zh 传空字符串删除。',
        '- zh 为空表示删除该范围。',
        '- 参考已提交内容，保持人名、术语和语气一致。',
        '- 句末不要加句号。',
        '- 男性生殖器统一译为「肉棒」，女性生殖器统一译为「小穴」。'
    ].join('\n')
}

/**
 * 构造发送给 AI 的完整识别 JSON
 * @param segments 识别段
 * @param modelPath 模型路径
 * @param language 识别语言
 */
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

/**
 * 拼接词文本
 * @param words 词列表
 * @param language 识别语言
 */
function joinWords(words: IWord[], language: SubtitleLanguage) {
    const text = words.map((word) => word.text).join(language === 'en' ? ' ' : '')

    return language === 'en' ? text.replace(/\s+/g, ' ').trim() : text
}

/**
 * 构造未覆盖词提示
 * @param words 全部词
 * @param claimed 已覆盖词索引
 */
function buildMissingPrompt(words: IWord[], claimed: Set<number>) {
    const ranges: string[] = []
    let start: number | null = null

    for (let index = 0; index < words.length; index++) {
        if (claimed.has(index)) {
            if (start !== null) {
                ranges.push(start === index - 1 ? `${start}` : `${start}-${index - 1}`)
                start = null
            }
            continue
        }

        if (start === null) start = index
    }

    if (start !== null) {
        ranges.push(start === words.length - 1 ? `${start}` : `${start}-${words.length - 1}`)
    }

    return [
        '以下词索引尚未覆盖，请继续调用 commit_subtitle 补齐（索引为全局词索引）：',
        ranges.join(', ')
    ].join('\n')
}

/**
 * 构造已提交内容
 * @param ranges 已提交范围
 */
function buildSubmittedContent(ranges: ISubmittedRange[]) {
    return JSON.stringify({
        subtitles: [...ranges]
            .sort((a, b) => a.fromWord - b.fromWord)
            .map((range) => ({
                fromWord: range.fromWord,
                toWord: range.toWord,
                zh: range.zh
            }))
    })
}

/**
 * 根据提交范围生成字幕
 * @param words 全部词
 * @param ranges 已提交范围
 * @param language 识别语言
 * @remark 未覆盖的缺口用规则切分兜底
 */
function buildCues(words: IWord[], ranges: ISubmittedRange[], language: SubtitleLanguage) {
    const committed = new Map<number, ISubmittedRange>()
    for (const range of ranges) committed.set(range.fromWord, range)

    const cues: ICue[] = []
    let cursor = 0

    while (cursor < words.length) {
        const range = committed.get(cursor)
        if (range) {
            if (range.zh) {
                const rangeWords = words.slice(range.fromWord, range.toWord + 1)
                const first = rangeWords[0]
                const last = rangeWords.at(-1)
                if (first && last) {
                    cues.push({
                        id: '',
                        from: first.from,
                        to: last.to,
                        text: joinWords(rangeWords, language),
                        zh: range.zh
                    })
                }
            }

            cursor = range.toWord + 1
            continue
        }

        let next = cursor
        while (next < words.length && !committed.has(next)) next++

        for (const cue of splitIntoCues(words.slice(cursor, next), language)) {
            cues.push({ id: '', from: cue.from, to: cue.to, text: cue.text })
        }

        cursor = next
    }

    return cues
}

/**
 * 用 AI 翻译全部识别结果
 * @param segments 识别段
 * @param modelPath 模型路径
 * @param language 识别语言
 * @param llm LLM 配置
 * @param signal 取消信号
 * @remark 一次发送完整 JSON，AI 通过 commit_subtitle 按词索引提交
 */
export async function translateSegments(
    segments: ISegment[],
    modelPath: string,
    language: SubtitleLanguage,
    llm: ISubtitleLlm,
    signal: AbortSignal
): Promise<ICue[] | null> {
    if (signal.aborted || !segments.length) return []

    const words = segments.flatMap((segment) => segment.words)
    if (!words.length) return []

    const system = buildTranslateSystemPrompt(language)
    const content = JSON.stringify(buildAsrJson(segments, modelPath, language))
    const messages: IAgentMessage[] = [{ role: 'user', content }]
    const ranges: ISubmittedRange[] = []
    const claimed = new Set<number>()

    const tools = createTools({
        words,
        claimed,
        ranges,
        maxCueMs: MAX_CUE_MS
    })
    const maxSteps = Math.min(300, Math.max(20, Math.ceil(words.length / 10)))

    const first = await chat({
        config: llm,
        messages,
        system,
        tools,
        maxSteps,
        toolCallConcurrency: AI_TOOL_CONCURRENCY,
        signal
    })
    if (!isChatSuccess(first)) {
        writeLog('error', '[字幕生成] AI翻译失败：', first.error ?? first.finishReason)
    }
    if (signal.aborted) return null

    // 一次提交都没有时交给上层回退谷歌翻译
    if (!ranges.length) return null

    if (claimed.size < words.length) {
        const missingPrompt = buildMissingPrompt(words, claimed)
        const submitted = buildSubmittedContent(ranges)
        const missingCount = words.length - claimed.size

        const second = await chat({
            config: llm,
            messages: [
                ...messages,
                { role: 'assistant', content: submitted },
                { role: 'user', content: missingPrompt }
            ],
            system,
            tools,
            maxSteps: Math.min(100, Math.max(5, Math.ceil(missingCount / 10))),
            toolCallConcurrency: AI_TOOL_CONCURRENCY,
            signal
        })
        if (!isChatSuccess(second)) {
            writeLog('warn', '[字幕生成] AI补译失败：', second.error ?? second.finishReason)
        }
        if (signal.aborted) return null
    }

    if (claimed.size < words.length) {
        writeLog('warn', '[字幕生成] 部分词未翻译，已回退规则切分', {
            missing: words.length - claimed.size
        })
    }

    return buildCues(words, ranges, language).map((cue, index) => ({
        ...cue,
        id: `c${index}`
    }))
}
