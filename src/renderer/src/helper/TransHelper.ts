import { Segmenter } from '@formatjs/intl-segmenter'
import { showGlobalWarn } from '@renderer/components/control/message'
import { AgentHelper, getRetryMessage } from '@renderer/helper/AgentHelper'
import { NetHelper } from '@renderer/helper/NetHelper.ts'
import { settingsStore } from '@renderer/stores'
import { isAgentSuccess } from '@shared'
import { createConverter } from 'js-opencc'

import { getAgentConfig } from './AgentHelper/AiConfig.ts'
import { StringHelper } from './EncodeHelper'
import { LogHelper } from './LogHelper'

/** 句子分段器 */
const sentenceSegmenter = new Segmenter('zh-CN', { granularity: 'sentence' })

export type TranslateTargetLanguage = 'zh-CN' | 'zh-TW'

export interface ITranslateSettings {
    /** 是否启用翻译 */
    enable: boolean
    /** AI 失败后回退谷歌 */
    retryWithGoogle: boolean
    /** 目标语言 */
    targetLanguage: TranslateTargetLanguage
    /** 是否启用 AI 翻译 */
    ai: boolean
}

export interface ITranslateResult {
    /** 是否成功 */
    ok: boolean
    /** 译文 */
    text: string
}

export type TStreamCallback = (data: string, reasoningData: string, reset?: boolean) => void

/** 翻译提示词 */
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

/**
 * 谷歌翻译
 * @param text 原文
 * @param targetLanguage 目标语言
 * @param streamCallback 流式回调
 * @param signal 取消信号
 */
async function translateByGoogleText(
    text: string,
    targetLanguage: string,
    streamCallback?: TStreamCallback,
    signal?: AbortSignal
): Promise<ITranslateResult> {
    // 请求参数
    const rpcids = 'MkEWBc'
    const searchParams = new URLSearchParams({
        rpcids,
        'source-path': '/',
        hl: 'zh-CN',
        'soc-app': '1',
        'soc-platform': '1',
        'soc-device': '1'
    })
    // 请求体
    const body = `f.req=${StringHelper.encodeUrl(
        `[[["${rpcids}","[[\\"${text}\\",\\"auto\\",\\"${targetLanguage}\\",1],[]]",null,"generic"]]]`
    )}&`

    const re = await NetHelper.post(
        `https://translate.google.com/_/TranslateWebserverUi/data/batchexecute?${searchParams}`,
        body,
        {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            delay: 500,
            signal
        }
    )

    if (re.ok) {
        try {
            const result = normaliseGoogleResponse(re.body).text.trim()
            streamCallback?.(result, '')
            return { ok: true, text: result }
        } catch (e) {
            LogHelper.error(`google翻译返回内容解析失败：`, re.body, e)
        }
    }

    // 失败返回原文
    streamCallback?.(text, '')
    return { ok: false, text }
}

/**
 * 解析谷歌翻译响应
 * @param rawBody 原始响应
 */
function normaliseGoogleResponse(rawBody: string) {
    let data: any
    try {
        data = JSON.parse(JSON.parse(rawBody.replace(/^\)\]\}'/, ''))[0][2])
    } catch {
        throw new Error('数据为空或损坏')
    }

    const text = (data[1][0][0][5] as Array<[string]>).reduce(
        (full, [block]) => (full ? `${full} ${block}` : block),
        ''
    )

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

export class TransHelper {
    /** 繁转简转换器 */
    private static traditionalToSimpleConverter: ((text: string) => string) | null = null

    /** 初始化繁转简 */
    static async init() {
        if (!this.traditionalToSimpleConverter) {
            this.traditionalToSimpleConverter = await createConverter({ from: 't', to: 'cn' }, [])
        }
    }

    /**
     * 翻译
     * @param text 原文
     * @param format 是否格式化
     * @param streamCallback 流式回调
     * @param signal 取消信号
     */
    static async translate(
        text: string,
        format: boolean = true,
        streamCallback?: TStreamCallback,
        signal?: AbortSignal
    ): Promise<ITranslateResult> {
        const settings = settingsStore()
        const { translate } = settings

        if (!translate.enable) {
            return { ok: false, text: format ? TransHelper.formatTranslateText(text) : text }
        }
        if (signal?.aborted) return { ok: false, text }

        let re: ITranslateResult = { ok: false, text }
        let hasAiDelta = false

        // AI 翻译
        if (translate.ai) {
            const config = getAgentConfig(settings.ai)
            if (config) {
                let retryWarned = false

                const result = await AgentHelper.ask({
                    config,
                    system: getTranslatePrompt(translate.targetLanguage),
                    prompt: text,
                    source: 'translate',
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

                        if (retryWarned) return
                        retryWarned = true
                        showGlobalWarn(message)
                    }
                })

                if (result.cancelled) return { ok: false, text }

                const resultText = result.text.trim()
                if (resultText && isAgentSuccess(result.finishReason)) {
                    re = { ok: true, text: resultText }
                }
            }
        }

        // 未启用 AI 或失败回退
        if (!re.ok && (!translate.ai || translate.retryWithGoogle) && !signal?.aborted) {
            if (translate.ai) LogHelper.warn('AI翻译失败，调用谷歌翻译...')

            re = await translateByGoogleText(
                text,
                translate.targetLanguage,
                // 有 AI 输出时不回传
                hasAiDelta ? undefined : streamCallback,
                signal
            )
        }

        re.text = TransHelper.toSimplified(re.text)
        return format ? { ...re, text: TransHelper.formatTranslateText(re.text) } : re
    }

    /** 按语言转简体 */
    private static toSimplified(text: string) {
        return settingsStore().translate.targetLanguage === 'zh-CN' ? this.translateSC(text) : text
    }

    /**
     * 使用指定提示词翻译
     * @param text 原文
     * @param system 系统提示词
     * @param signal 取消信号
     */
    static async translateWithSystem(
        text: string,
        system: string,
        signal?: AbortSignal
    ): Promise<ITranslateResult> {
        const settings = settingsStore()
        if (!settings.translate.enable) return { ok: false, text }
        // 未启用 AI 走谷歌
        if (!settings.translate.ai) return this.translate(text, false, undefined, signal)

        const config = getAgentConfig(settings.ai)
        if (!config) return { ok: false, text }

        const result = await AgentHelper.ask({
            config,
            system,
            prompt: text,
            source: 'translate',
            signal
        })
        const resultText = result.text.trim()

        if (!resultText || !isAgentSuccess(result.finishReason)) return { ok: false, text }

        return { ok: true, text: TransHelper.toSimplified(resultText) }
    }

    /** 谷歌翻译 */
    static async translateByGoogle(text: string, signal?: AbortSignal): Promise<ITranslateResult> {
        const re = await translateByGoogleText(
            text,
            settingsStore().translate.targetLanguage,
            undefined,
            signal
        )
        re.text = TransHelper.toSimplified(re.text)
        return re
    }

    /** 繁转简 */
    static translateSC(text: string): string {
        return this.traditionalToSimpleConverter ? this.traditionalToSimpleConverter(text) : text
    }

    /** 格式化译文 */
    static formatTranslateText(text: string) {
        const segments = Array.from(sentenceSegmenter.segment(text))
            .filter((item): item is NonNullable<typeof item> => Boolean(item))
            .map((item) => item.segment.trim())
            // 仅单独 …… 换行
            .flatMap((segment) => segment.split(/(?<=……)(?![\p{P}\p{S}])/u))
            .map((segment) => segment.trim())
            .filter(Boolean)

        const merged: string[] = []
        for (const segment of segments) {
            const last = merged.at(-1)

            // 不以 、 换行
            if (last?.endsWith('、')) {
                merged[merged.length - 1] = `${last}${segment}`
                continue
            }

            merged.push(segment)
        }

        return merged
            .join('\n\n')
            .replaceAll(/(?<!\n)“/gu, '\n\n“')
            .replaceAll(/“\n+/gu, '“')
            .trim()
    }
}
