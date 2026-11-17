import type { ICue, ICueDraft, IWord, SubtitleLanguage } from './types'

/** 单条字幕最大字数 */
export const MAX_CUE_CHARS = 24
/** 单条字幕最大时长（毫秒） */
export const MAX_CUE_MS = 10000
/** 相邻词最大间隔（毫秒） */
export const MAX_CUE_GAP_MS = 700

const SRT_TIMESTAMP_PATTERN =
    /^(?<hours>\d{2}):(?<minutes>\d{2}):(?<seconds>\d{2}),(?<millis>\d{3})$/

/** 拼接词文本 */
function joinWordText(words: IWord[], language: SubtitleLanguage) {
    const text = words.map((word) => word.text).join(language === 'en' ? ' ' : '')

    return language === 'en' ? text.replace(/\s+/g, ' ').trim() : text
}

/** 按长度与标点切分 */
export function splitIntoCues(words: IWord[], language: SubtitleLanguage): ICueDraft[] {
    const cues: ICueDraft[] = []
    let bucket: IWord[] = []

    for (const word of words) {
        const previous = bucket.at(-1)

        // 间隔过大先切条
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
            to: bucket.at(-1)!.to,
            text: joinWordText(bucket, language)
        })
    }

    return cues.filter((cue) => cue.text.trim())
}

/** 格式化 SRT 时间戳 */
export function formatSrtTimestamp(ms: number) {
    const value = Math.max(0, Math.round(ms))
    const hours = Math.floor(value / 3_600_000)
    const minutes = Math.floor((value % 3_600_000) / 60_000)
    const seconds = Math.floor((value % 60_000) / 1000)
    const millis = value % 1000
    const hh = String(hours).padStart(2, '0')
    const mm = String(minutes).padStart(2, '0')
    const ss = String(seconds).padStart(2, '0')
    const mmm = String(millis).padStart(3, '0')

    return `${hh}:${mm}:${ss},${mmm}`
}

/** 解析 SRT 时间戳，非法返回 null */
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

/** 渲染 SRT */
export function renderSrt(cues: ICue[]) {
    return cues
        .map((cue, index) => {
            const from = formatSrtTimestamp(cue.from)
            const to = formatSrtTimestamp(cue.to)

            return `${index + 1}\n${from} --> ${to}\n${cue.zh ?? cue.text}\n`
        })
        .join('\n')
}
