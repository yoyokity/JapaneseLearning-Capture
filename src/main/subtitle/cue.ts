import type { ICue, ICueDraft, IWord, SubtitleLanguage } from './types'

/** 单条字幕最大字数 */
export const MAX_CUE_CHARS = 24
/** 单条字幕最大时长（毫秒） */
export const MAX_CUE_MS = 10000
/** 相邻词的最大间隔（毫秒） */
export const MAX_CUE_GAP_MS = 700

const SRT_TIMESTAMP_PATTERN =
    /^(?<hours>\d{2}):(?<minutes>\d{2}):(?<seconds>\d{2}),(?<millis>\d{3})$/

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
 * 按标点、长度与词间间隔切分字幕
 * @param words 词列表
 * @param language 识别语言
 */
export function splitIntoCues(words: IWord[], language: SubtitleLanguage): ICueDraft[] {
    const cues: ICueDraft[] = []
    let bucket: IWord[] = []

    for (const word of words) {
        const previous = bucket.at(-1)

        // 词间间隔过大时先切条，避免把长间隔并进同一条字幕
        if (previous && word.from - previous.to > MAX_CUE_GAP_MS) {
            cues.push({
                from: bucket[0]!.from,
                to: previous.to,
                text: joinWordText(bucket, language)
            })
            bucket = []
        }

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
export function formatSrtTimestamp(ms: number) {
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
 * 解析 SRT 时间戳
 * @param value SRT 时间戳
 * @returns 毫秒数，格式非法时返回 null
 */
export function parseSrtTimestamp(value: string) {
    const match = SRT_TIMESTAMP_PATTERN.exec(value.trim())
    if (!match?.groups) return null

    const { hours, minutes, seconds, millis } = match.groups
    return (
        Number(hours) * 3_600_000 +
        Number(minutes) * 60_000 +
        Number(seconds) * 1000 +
        Number(millis)
    )
}

/**
 * 渲染 SRT
 * @param cues 字幕条
 */
export function renderSrt(cues: ICue[]) {
    return cues
        .map(
            (cue, index) =>
                `${index + 1}\n${formatSrtTimestamp(cue.from)} --> ${formatSrtTimestamp(cue.to)}\n${cue.zh ?? cue.text}\n`
        )
        .join('\n')
}
