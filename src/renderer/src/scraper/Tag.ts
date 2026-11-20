import type { ITranslateResult } from '@renderer/helper'

import { DataHelper, TransHelper } from '@renderer/helper'
import { settingsStore } from '@renderer/stores'

const DATA_NAME = '#tag-data'
// 每批数量
const BATCH_SIZE = 100

export interface ITag {
    /**
     * 原文
     */
    tag: string
    /**
     * 译文
     */
    translated: string
}

// 串行队列
let translateQueue: Promise<unknown> = Promise.resolve()

/**
 * 翻译 tag 数组
 * @param tags tag 列表
 * @param extraPrompt 附加提示词
 * @param signal 取消信号
 */
export function translateTags(
    tags: string[],
    extraPrompt?: string,
    signal?: AbortSignal
): Promise<string[]> {
    const task = translateQueue.then(() => doTranslateTags(tags, extraPrompt, signal))
    // 失败不阻塞后续
    translateQueue = task.catch(() => {})
    return task
}

/** 翻译 tag 数组 */
async function doTranslateTags(
    tags: string[],
    extraPrompt?: string,
    signal?: AbortSignal
): Promise<string[]> {
    const uniqueTags = [...new Set(tags)]
    const { translate } = settingsStore()
    if (!translate.enable || uniqueTags.length === 0 || signal?.aborted) return uniqueTags

    // 按语言区分缓存
    const getCacheKey = (tag: string) => JSON.stringify([translate.targetLanguage, tag])

    // 读取缓存
    const cached = (await DataHelper.getMany<ITag>(DATA_NAME, uniqueTags.map(getCacheKey))).map(
        (item) => item?.translated || null
    )
    const untranslatedTags = uniqueTags.filter((_, index) => !cached[index])

    // 分批翻译
    const translatedMap = new Map<string, string>()
    for (let index = 0; index < untranslatedTags.length; index += BATCH_SIZE) {
        if (signal?.aborted) break

        const batch = untranslatedTags.slice(index, index + BATCH_SIZE)
        const results = await translateUntranslated(batch, extraPrompt, signal)

        const cacheEntries: [string, ITag][] = []
        batch.forEach((tag, i) => {
            const re = results[i]
            if (!re.ok || !re.text) return

            translatedMap.set(tag, re.text)
            cacheEntries.push([getCacheKey(tag), { tag, translated: re.text }])
        })
        // 每批写库
        await DataHelper.setMany(DATA_NAME, cacheEntries)
    }

    // 合并结果
    return uniqueTags.map((tag, index) => cached[index] ?? translatedMap.get(tag) ?? tag)
}

/**
 * 翻译未缓存 tag
 * @param tags 待翻译 tag
 * @param extraPrompt 附加提示词
 * @param signal 取消信号
 */
async function translateUntranslated(
    tags: string[],
    extraPrompt?: string,
    signal?: AbortSignal
): Promise<ITranslateResult[]> {
    const { targetLanguage } = settingsStore().translate

    // 整批翻译
    const re = await TransHelper.translateWithSystem(
        JSON.stringify(tags),
        getPrompt(targetLanguage, extraPrompt),
        signal
    )
    const translated = re.ok ? parseTranslatedTags(re.text, tags.length) : null
    if (translated) return translated.map((text) => ({ ok: true, text: text.trim() }))

    // 已取消返回原文
    if (signal?.aborted) return tags.map((tag) => ({ ok: false, text: tag }))

    // 失败逐条回退
    const results: ITranslateResult[] = []
    for (const tag of tags) {
        results.push(await TransHelper.translate(tag, false, undefined, signal))
    }
    return results
}

/**
 * 解析 AI 译文
 * @param text AI 返回文本
 * @param length 期望长度
 */
function parseTranslatedTags(text: string, length: number): string[] | null {
    // 去除代码块
    const content = text
        .trim()
        .replace(/^```\w*\s*/, '')
        .replace(/```$/, '')
        .trim()

    try {
        const data = JSON.parse(content)
        const valid =
            Array.isArray(data) &&
            data.length === length &&
            data.every((item) => typeof item === 'string')
        return valid ? data : null
    } catch {
        return null
    }
}

/**
 * 获取翻译提示词
 * @param targetLanguage 目标语言
 * @param extraPrompt 附加提示词
 */
function getPrompt(targetLanguage: string, extraPrompt?: string) {
    return `- 你是一个翻译助手，你会将我说的话翻译成${targetLanguage}。
- 输入是一个JSON文本数组，请逐个翻译每个Tag标签，保持原有的顺序和数量以及相关性。
- 只返回翻译后的JSON文本数组，不要返回md格式、注释、提示或其他内容。
- 数字、符号等不需要翻译的内容保持原样。${extraPrompt ? `\n- ${extraPrompt}` : ''}`
}
