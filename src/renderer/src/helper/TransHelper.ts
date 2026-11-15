import { Segmenter } from '@formatjs/intl-segmenter'
import { showGlobalWarn } from '@renderer/components/control/message'
import { AgentHelper, getRetryMessage } from '@renderer/helper/AgentHelper.ts'
import { NetHelper } from '@renderer/helper/NetHelper.ts'
import { settingsStore } from '@renderer/stores'
import { isAgentSuccess } from '@shared'
import { createConverter } from 'js-opencc'

import { getAgentConfig } from './AiConfig.ts'
import { StringHelper } from './EncodeHelper'
import { LogHelper } from './LogHelper'

// 句子分段器，用于格式化翻译结果
const sentenceSegmenter = new Segmenter('zh-CN', {
    granularity: 'sentence'
})

export type TranslateTargetLanguage = 'zh-CN' | 'zh-TW'

export interface ITranslateSettings {
    enable: boolean
    retryWithGoogle: boolean
    targetLanguage: TranslateTargetLanguage
    ai: boolean
}

export interface ITranslateResult {
    ok: boolean
    text: string
}

export type TStreamCallback = (data: string, reasoningData: string, reset?: boolean) => void

/**
 * 谷歌翻译
 * @param s_text 要翻译的文本
 * @param targetLanguage 目标语言
 * @param streamCallback 流式回调
 */
async function translateByGoogleText(
    s_text: string,
    targetLanguage: string,
    streamCallback?: TStreamCallback,
    signal?: AbortSignal
): Promise<ITranslateResult> {
    const translateOptions = {
        from: 'auto',
        to: targetLanguage,
        hl: 'zh-CN', // Host language
        tld: 'com',
        rpcids: 'MkEWBc'
    }

    // url
    const searchParams = new URLSearchParams({
        rpcids: translateOptions.rpcids,
        'source-path': '/',
        hl: translateOptions.hl,
        'soc-app': '1',
        'soc-platform': '1',
        'soc-device': '1'
    })
    const url = `https://translate.google.${translateOptions.tld}/_/TranslateWebserverUi/data/batchexecute?${searchParams}`

    // body
    const encodedData = StringHelper.encodeUrl(
        `[[["${translateOptions.rpcids}","[[\\"${s_text}\\",\\"${translateOptions.from}\\",\\"${translateOptions.to}\\",1],[]]",null,"generic"]]]`
    )
    const body = `f.req=${encodedData}&`

    // headers
    const headers = {
        'Content-Type': 'application/x-www-form-urlencoded'
    }

    const re = await NetHelper.post(url, body, {
        headers,
        delay: 500,
        signal
    })

    if (re.ok) {
        try {
            const text = normaliseGoogleResponse(re.body).text.trim()
            streamCallback?.(text, '')
            return {
                ok: true,
                text
            }
        } catch (e) {
            LogHelper.error(`google翻译返回内容解析失败：`, re.body, e)
        }
    }

    // 翻译失败则原文返回
    streamCallback?.(s_text, '')
    return { ok: false, text: s_text }
}

/**
 * 解析谷歌翻译返回数据
 * @param data 原始响应
 */
function parseGoogleResponse(data: string) {
    try {
        const content = JSON.parse(data.replace(/^\)\]\}'/, ''))
        const translationResponse = JSON.parse(content[0][2])

        return translationResponse
    } catch {
        throw new Error('数据为空或损坏')
    }
}

/**
 * 格式化谷歌翻译返回数据
 * @param rawBody 原始响应体
 */
function normaliseGoogleResponse(rawBody: string) {
    const data = parseGoogleResponse(rawBody)
    const translatedPhrases = data[1][0][0][5] as Array<[string]>
    const text = translatedPhrases.reduce((fullText, [textBlock]) => {
        return fullText ? `${fullText} ${textBlock}` : textBlock
    }, '')

    return {
        text,
        pronunciation: data[1][0][0][1],
        from: {
            language: {
                didYouMean: Boolean(data[0][1]),
                iso: data[2]
            },
            text: {
                pronunciation: data[0][0],
                autoCorrected: Boolean(data[0][1]),
                value: data[0][6][0],
                didYouMean: data[0][1] ? data[0][1][0][4] : null
            }
        }
    }
}

/**
 * 翻译相关
 */
export class TransHelper {
    private static traditionalToSimpleConverter: ((text: string) => string) | null = null

    /**
     * 初始化本地繁转简转换器
     */
    static async init() {
        if (!this.traditionalToSimpleConverter) {
            this.traditionalToSimpleConverter = await createConverter({ from: 't', to: 'cn' }, [])
        }
    }

    /**
     * 翻译
     * @param text 要翻译的文本
     * @param format 是否格式化，默认为 true
     * @param streamCallback 翻译过程中每一次流传输的回调，不会对data进行格式化处理
     * @returns 如果ok为false，则返回格式化后的原文
     */
    static async translate(
        text: string,
        format: boolean = true,
        streamCallback?: TStreamCallback,
        signal?: AbortSignal
    ): Promise<ITranslateResult> {
        const settings = settingsStore()
        if (!settings.translate.enable)
            return { ok: false, text: format ? TransHelper.formatTranslateText(text) : text }

        let re: ITranslateResult = { ok: false, text }
        let hasAiDelta = false

        if (settings.translate.ai) {
            const config = getAgentConfig(settings.ai)
            if (config) {
                const result = await AgentHelper.ask({
                    config,
                    system: getTranslatePrompt(settings.translate.targetLanguage),
                    prompt: text,
                    signal,
                    callback: (data, reasoningData, reset) => {
                        if (reset) {
                            hasAiDelta = false
                            streamCallback?.('', '', true)
                            return
                        }

                        if (data) hasAiDelta = true
                        streamCallback?.(data, reasoningData)
                    },
                    onRetry: (info) => {
                        const message = getRetryMessage(info)
                        LogHelper.warn(message)
                        showGlobalWarn(message)
                    }
                })

                if (result.cancelled) {
                    return { ok: false, text }
                }

                const resultText = result.text.trim()

                if (resultText && isAgentSuccess(result.finishReason)) {
                    re = { ok: true, text: resultText }
                }
            }
        }

        // 未启用 AI，或 AI 翻译失败后按设置回退
        const shouldUseGoogle = !settings.translate.ai || settings.translate.retryWithGoogle

        if (!re.ok && shouldUseGoogle) {
            if (settings.translate.ai) {
                LogHelper.warn('AI翻译失败，调用谷歌翻译...')
            }

            re = await translateByGoogleText(
                text,
                settings.translate.targetLanguage,
                // AI 已输出过部分文本时不再流式回传，避免和谷歌译文拼接
                hasAiDelta ? undefined : streamCallback,
                signal
            )
        }

        re.text = TransHelper.toSimplified(re.text)
        return format ? { ...re, text: TransHelper.formatTranslateText(re.text) } : re
    }

    /**
     * 按语言转简体
     * @param text 文本
     */
    private static toSimplified(text: string) {
        return settingsStore().translate.targetLanguage === 'zh-CN' ? this.translateSC(text) : text
    }

    /**
     * 使用指定提示词翻译
     * @param text 文本
     * @param system 系统提示词
     */
    static async translateWithSystem(
        text: string,
        system: string,
        signal?: AbortSignal
    ): Promise<ITranslateResult> {
        const settings = settingsStore()
        if (!settings.translate.enable) return { ok: false, text }

        // 未启用 AI 时走谷歌翻译
        if (!settings.translate.ai) return this.translate(text, false)

        const config = getAgentConfig(settings.ai)
        if (!config) return { ok: false, text }

        const result = await AgentHelper.ask({
            config,
            system,
            prompt: text,
            signal
        })
        const resultText = result.text.trim()

        if (!resultText || !isAgentSuccess(result.finishReason)) return { ok: false, text }

        return { ok: true, text: TransHelper.toSimplified(resultText) }
    }

    /**
     * 谷歌翻译
     * @param text 文本
     */
    static async translateByGoogle(text: string): Promise<ITranslateResult> {
        const settings = settingsStore()
        const re = await translateByGoogleText(text, settings.translate.targetLanguage)
        re.text = TransHelper.toSimplified(re.text)
        return re
    }

    /**
     * 本地繁体转化为简体
     */
    static translateSC(text: string): string {
        return this.traditionalToSimpleConverter ? this.traditionalToSimpleConverter(text) : text
    }

    /**
     * 格式化翻译文本
     * @param text 翻译文本
     * @description 每一句话之间隔一行，同时句首顶格，全部翻译为简体中文，最后将文本中的转义换行符转为普通换行
     */
    static formatTranslateText(text: string) {
        const segments = Array.from(sentenceSegmenter.segment(text))
            .filter((item): item is NonNullable<typeof item> => Boolean(item))
            .map((item) => item.segment.trim())
            // 只有单独的 …… 才作为换行符，后面跟其他标点时不换行
            .flatMap((segment) => segment.split(/(?<=……)(?![\p{P}\p{S}])/u))
            .map((segment) => segment.trim())
            .filter(Boolean)

        const mergedSegments: string[] = []
        for (const segment of segments) {
            const lastSegment = mergedSegments.at(-1)

            // 不使用 、 作为换行分隔符
            if (lastSegment?.endsWith('、')) {
                mergedSegments[mergedSegments.length - 1] = `${lastSegment}${segment}`
                continue
            }

            mergedSegments.push(segment)
        }

        return mergedSegments
            .join('\n\n')
            .replaceAll(/(?<!\n)“/gu, '\n\n“')
            .replaceAll(/“\n+/gu, '“')
            .trim()
    }
}

/**
 * 翻译提示词
 */
function getTranslatePrompt(targetLanguage: string) {
    return `
    - 你是一个翻译助手，你会将我说的话翻译成${targetLanguage}。
    - 不要返回md格式，返回纯文本给我。
    - 不要有任何注释、提示、指令，只返回翻译后的文本。
    - 标点符号之类的转为${targetLanguage}语言的标点。
    - 注意联系上下文正确使用人称代词，不要混淆使役态和被动态的主语和宾语。
    - 语句的前后逻辑关系要通顺，不要前后矛盾。
    - 如果遇到英文片假名，结合语境判断是翻译成英文原文还是翻译成${targetLanguage}，一定不要保留原有的日文片假名。
    - 人名使用中文音译。
    - 自行优化排版。
    - 如果遇到屏蔽字符比如○、●之类的，请自行联想NSFW色情词汇。
    - 一定不要包含屏蔽字，比如○、●
    - 让语句表达更加NSFW色情、淫秽。`
}
