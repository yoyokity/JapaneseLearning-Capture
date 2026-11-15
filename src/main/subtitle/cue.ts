import type { ICue, ICueDraft, IWord, SubtitleLanguage } from './types'

/** 单条字幕最大字数 */
export const MAX_CUE_CHARS = 24
/** 单条字幕最大时长（毫秒） */
const MAX_CUE_MS = 8000

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
export function splitIntoCues(words: IWord[], language: SubtitleLanguage): ICueDraft[] {
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
export function renderSrt(cues: ICue[]) {
    return cues
        .map(
            (cue, index) =>
                `${index + 1}\n${formatTimestamp(cue.from)} --> ${formatTimestamp(cue.to)}\n${cue.zh ?? cue.text}\n`
        )
        .join('\n')
}
