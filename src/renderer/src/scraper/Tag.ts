import type { ITranslateResult } from '@renderer/helper'

import { DataHelper, TransHelper } from '@renderer/helper'
import { settingsStore } from '@renderer/stores'

const DATA_NAME = '#tag-data'
// 每批翻译数量
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

// 翻译队列，避免并发请求
let translateQueue: Promise<unknown> = Promise.resolve()

/**
 * 翻译tag数组
 * @param tags tag数组
 * @param extraPrompt 附加提示词
 * @returns 去重后的译文数组
 */
export function translateTags(tags: string[], extraPrompt?: string): Promise<string[]> {
    // 串行执行，复用前次缓存
    const task = translateQueue.then(() => doTranslateTags(tags, extraPrompt))
    // 失败不阻塞后续任务
    translateQueue = task.catch(() => {})
    return task
}

/**
 * 翻译tag数组
 * @param tags tag数组
 * @param extraPrompt 附加提示词
 * @returns 去重后的译文数组
 */
async function doTranslateTags(tags: string[], extraPrompt?: string): Promise<string[]> {
    const uniqueTags = [...new Set(tags)]
    const settings = settingsStore()
    if (!settings.translate.enable || uniqueTags.length === 0) return uniqueTags

    const targetLanguage = settings.translate.targetLanguage

    // 谷歌翻译不缓存
    if (settings.translate.translateEngine === 'google') {
        const results: string[] = []
        for (const tag of uniqueTags) {
            results.push((await TransHelper.translate(tag, false)).text)
        }
        return results
    }

    // 缓存按目标语言区分
    const getCacheKey = (tag: string) => JSON.stringify([targetLanguage, tag])

    // 读取缓存
    const cached = (await DataHelper.getMany<ITag>(DATA_NAME, uniqueTags.map(getCacheKey))).map(
        (item) => item?.translated || null
    )
    const untranslatedTags = uniqueTags.filter((_, index) => !cached[index])

    // 分批翻译
    const translatedMap = new Map<string, string>()
    for (let index = 0; index < untranslatedTags.length; index += BATCH_SIZE) {
        const batch = untranslatedTags.slice(index, index + BATCH_SIZE)
        const results = await translateUntranslated(batch, extraPrompt)

        const cacheEntries: [string, ITag][] = []
        batch.forEach((tag, i) => {
            const re = results[i]
            if (!re.ok || !re.text) return

            translatedMap.set(tag, re.text)
            cacheEntries.push([getCacheKey(tag), { tag, translated: re.text }])
        })
        // 每批成功后写库
        await DataHelper.setMany(DATA_NAME, cacheEntries)
    }

    // 合并缓存与新译文
    return uniqueTags.map((tag, index) => cached[index] ?? translatedMap.get(tag) ?? tag)
}

/**
 * 翻译未缓存的tag
 * @param tags 待翻译的tag
 * @param extraPrompt 附加提示词
 */
async function translateUntranslated(
    tags: string[],
    extraPrompt?: string
): Promise<ITranslateResult[]> {
    const settings = settingsStore()

    // AI一次请求翻译整批
    const re = await TransHelper.translateWithSystem(
        JSON.stringify(tags),
        getPrompt(settings.translate.targetLanguage, extraPrompt)
    )
    const translated = re.ok ? parseTranslatedTags(re.text, tags.length) : null
    if (translated) return translated.map((text) => ({ ok: true, text: text.trim() }))

    // 失败时逐条回退
    const retryWithGoogle = settings.translate.retryWithGoogle
    const results: ITranslateResult[] = []
    for (const tag of tags) {
        results.push(
            retryWithGoogle ? await TransHelper.translateByGoogle(tag) : { ok: false, text: tag }
        )
    }
    return results
}

/**
 * 解析AI返回的译文
 * @param text AI返回文本
 * @param length 期望长度
 */
function parseTranslatedTags(text: string, length: number): string[] | null {
    // 去除md代码块包裹
    const content = text
        .trim()
        .replace(/^```\w*\s*/, '')
        .replace(/```$/, '')
        .trim()

    try {
        const data = JSON.parse(content)
        if (
            Array.isArray(data) &&
            data.length === length &&
            data.every((item) => typeof item === 'string')
        ) {
            return data
        }
    } catch {
        // 忽略解析失败
    }

    return null
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
