import type {
    ICue,
    ICueDraft,
    ISegment,
    ISentence,
    ISubtitleLlm,
    IWord,
    SubtitleLanguage
} from './types'

import { createAgentStream, isAgentSuccess } from '../agent'
import { MAX_CUE_CHARS, splitIntoCues } from './cue'

/** 语言名称 */
const LANGUAGE_NAMES: Record<SubtitleLanguage, string> = {
    ja: '日语',
    en: '英语',
    zh: '中文',
    ko: '韩语'
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
export async function correctSegments(
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
export async function translateCues(
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
