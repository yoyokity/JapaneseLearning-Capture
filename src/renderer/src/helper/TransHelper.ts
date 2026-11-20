import { Segmenter } from '@formatjs/intl-segmenter'
import { showGlobalWarn } from '@renderer/components/control/message'
import { AgentHelper, getRetryMessage } from '@renderer/helper/AgentHelper'
import { settingsStore } from '@renderer/stores'
import { isAgentSuccess } from '@shared'
import { createConverter } from 'js-opencc'

import { getAgentConfig } from './AgentHelper/AiConfig.ts'
import { LogHelper } from './LogHelper'

/** 句子分段器 */
const sentenceSegmenter = new Segmenter('zh-CN', { granularity: 'sentence' })

export type TranslateTargetLanguage = 'zh-CN' | 'zh-TW'

export interface ITranslateSettings {
    /** 是否启用翻译 */
    enable: boolean
    /** 目标语言 */
    targetLanguage: TranslateTargetLanguage
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

export class TransHelper {
    /** 繁转简转换器 */
    private static traditionalToSimpleConverter: ((text: string) => string) | null = null

    /** 初始化繁转简 */
    static async init() {
        this.traditionalToSimpleConverter ??= await createConverter({ from: 't', to: 'cn' }, [])
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
        const { translate, ai } = settingsStore()

        if (!translate.enable) {
            return { ok: false, text: format ? this.formatTranslateText(text) : text }
        }
        if (signal?.aborted) return { ok: false, text }

        let re: ITranslateResult = { ok: false, text }

        const config = getAgentConfig(ai)
        if (config) {
            let retryWarned = false

            const result = await AgentHelper.ask({
                config,
                system: getTranslatePrompt(translate.targetLanguage),
                prompt: text,
                source: 'translate',
                signal,
                callback: (data, reasoningData, reset) =>
                    streamCallback?.(reset ? '' : data, reasoningData, reset),
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

        re.text = this.toSimplified(re.text)
        return format ? { ...re, text: this.formatTranslateText(re.text) } : re
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
        const { translate, ai } = settingsStore()
        if (!translate.enable) return { ok: false, text }

        const config = getAgentConfig(ai)
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

        return { ok: true, text: this.toSimplified(resultText) }
    }

    /** 繁转简 */
    static translateSC(text: string): string {
        return this.traditionalToSimpleConverter ? this.traditionalToSimpleConverter(text) : text
    }

    /** 格式化译文 */
    static formatTranslateText(text: string) {
        const segments = Array.from(sentenceSegmenter.segment(text))
            .filter((item): item is NonNullable<typeof item> => Boolean(item))
            // 仅单独 …… 换行
            .flatMap((item) => item.segment.trim().split(/(?<=……)(?![\p{P}\p{S}])/u))
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

    /** 按语言转简体 */
    private static toSimplified(text: string) {
        return settingsStore().translate.targetLanguage === 'zh-CN' ? this.translateSC(text) : text
    }
}
