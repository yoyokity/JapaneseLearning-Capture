import { NetHelper } from '@renderer/helper/NetHelper.ts'
import { settingsStore } from '@renderer/stores'
import { toSimplified, toTraditional } from 'chinese-simple2traditional'
import { setupEnhance } from 'chinese-simple2traditional/enhance'

import { EncodeHelper } from './EncodeHelper'
import { LogHelper } from './LogHelper'

// 注入短语库，提高准确性
setupEnhance()

export type TranslateEngine = keyof typeof translators
export type TranslateTargetLanguage = 'zh-CN' | 'zh-TW'
export const DeepseekReasoningEffortArray = ['high', 'max'] as const
export interface ITranslateSettings {
    enable: boolean
    retryWithGoogle: boolean
    targetLanguage: TranslateTargetLanguage
    translateEngine: TranslateEngine
    openai: {
        apiKey: string
        model: string
        baseURL: string
    }
    deepseek: {
        apiKey: string
        model: string
        thinking: boolean
        reasoningEffort: (typeof DeepseekReasoningEffortArray)[number]
    }
    gemini: {
        apiKey: string
        model: string
    }
    localLLM: {
        port: number
        model: string
        host: string
    }
}

export interface ITranslateResult {
    ok: boolean
    text: string
}

export type TStreamCallback = (data: string, reasoningData: string) => void

const translators = {
    google: {
        description: '谷歌机器翻译不需要额外配置',
        func: async (
            s_text: string,
            targetLanguage = 'zh-CN',
            streamCallback?: TStreamCallback
        ): Promise<ITranslateResult> => {
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
            const normalizedText = escapeSpecialSymbols(s_text)
            const encodedData = EncodeHelper.encodeUrl(
                `[[["${translateOptions.rpcids}","[[\\"${normalizedText}\\",\\"${translateOptions.from}\\",\\"${translateOptions.to}\\",1],[]]",null,"generic"]]]`
            )
            const body = `f.req=${encodedData}&`

            // headers
            const headers = {
                'Content-Type': 'application/x-www-form-urlencoded'
            }

            const re = await NetHelper.post(url, body, {
                headers,
                delay: 500
            })

            if (re.ok) {
                try {
                    const text = normaliseResponse(re.body).text.trim()
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

            function parseData(data: string) {
                try {
                    const content = JSON.parse(data.replace(/^\)\]\}'/, ''))
                    const translationResponse = JSON.parse(content[0][2])

                    return translationResponse
                } catch {
                    throw new Error('数据为空或损坏')
                }
            }

            function normaliseResponse(rawBody: string) {
                const data = parseData(rawBody)
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
        }
    },

    openai: {
        description: 'OpenAI翻译，适合接入官方接口或兼容OpenAI格式的中转服务',
        func: async (
            s_text: string,
            targetLanguage = 'zh-CN',
            streamCallback?: TStreamCallback
        ): Promise<ITranslateResult> => {
            const settings = settingsStore()

            // TODO：添加推理强度设置
            const result = await NetHelper.ai({
                provider: 'openai',
                apiKey: settings.translate.openai.apiKey,
                model: settings.translate.openai.model,
                baseURL: settings.translate.openai.baseURL,
                system: getGptPrompt(targetLanguage),
                prompt: escapeSpecialSymbols(s_text),
                callback: streamCallback
            })
            const text = result.text.trim()

            if (text) {
                try {
                    return {
                        ok: true,
                        text
                    }
                } catch (e) {
                    LogHelper.error(`openai翻译返回内容解析失败：`, text, e)
                }
            }

            // 翻译失败则原文返回
            return { ok: false, text: s_text }
        }
    },

    deepseek: {
        description: 'DeepSeek翻译，使用DeepSeek官方接口',
        func: async (
            s_text: string,
            targetLanguage = 'zh-CN',
            streamCallback?: TStreamCallback
        ): Promise<ITranslateResult> => {
            const settings = settingsStore()

            const result = await NetHelper.ai({
                provider: 'deepseek',
                apiKey: settings.translate.deepseek.apiKey,
                model: settings.translate.deepseek.model,
                system: getDeepSeekPrompt(targetLanguage),
                prompt: escapeSpecialSymbols(s_text),
                providerOptions: {
                    deepseek: settings.translate.deepseek.thinking
                        ? {
                              thinking: { type: 'enabled' },
                              reasoning_effort: settings.translate.deepseek.reasoningEffort
                          }
                        : {
                              thinking: { type: 'disabled' }
                          }
                },
                callback: streamCallback
            })
            const text = result.text.trim()

            if (text) {
                try {
                    return {
                        ok: true,
                        text
                    }
                } catch (e) {
                    LogHelper.error(`deepseek翻译返回内容解析失败：`, text, e)
                }
            }

            // 翻译失败则原文返回
            return { ok: false, text: s_text }
        }
    },

    gemini: {
        description:
            '除非你电脑跑不动本地llm，同时想用免费api，否则不推荐使用。因为很多敏感词不给翻译（失败自动改用google机器翻译）',
        func: async (
            s_text: string,
            targetLanguage = 'zh-CN',
            streamCallback?: TStreamCallback
        ): Promise<ITranslateResult> => {
            const settings = settingsStore()

            const result = await NetHelper.ai({
                provider: 'gemini',
                apiKey: settings.translate.gemini.apiKey,
                model: settings.translate.gemini.model,
                system: getGeminiPrompt(targetLanguage),
                prompt: escapeSpecialSymbols(s_text),
                providerOptions: {
                    google: {
                        safetySettings: [
                            {
                                category: 'HARM_CATEGORY_UNSPECIFIED',
                                threshold: 'BLOCK_NONE'
                            }
                        ]
                    }
                },
                callback: streamCallback
            })
            const text = result.text.trim()

            if (text) {
                try {
                    return {
                        ok: true,
                        text
                    }
                } catch (e) {
                    LogHelper.error(`gemini翻译返回内容解析失败：`, text, e)
                }
            }

            // 翻译失败则原文返回
            return { ok: false, text: s_text }
        }
    },

    localLLM: {
        description: '本地AI大模型，效果好且不用担心敏感内容被屏蔽，需要按照说明安装本地模型',
        func: async (
            s_text: string,
            targetLanguage = '简体中文',
            streamCallback?: TStreamCallback
        ): Promise<ITranslateResult> => {
            const settings = settingsStore()

            const result = await NetHelper.ai({
                provider: 'openai',
                apiKey: 'local-llm',
                model: settings.translate.localLLM.model,
                baseURL: `http://${settings.translate.localLLM.host}:${settings.translate.localLLM.port}/v1`,
                system: getLLMPrompt(targetLanguage),
                prompt: escapeSpecialSymbols(s_text),
                callback: streamCallback,
                timeout: 30 * 1000 // 预留充分时间，方便llm加载
            })
            const text = result.text.trim()

            if (text) {
                try {
                    return {
                        ok: true,
                        text
                    }
                } catch (e) {
                    LogHelper.error(`localLLM翻译返回内容解析失败：`, text, e)
                }
            }

            // 翻译失败则原文返回
            return { ok: false, text: s_text }
        }
    }
} as const

/**
 * 翻译相关
 */
export class TransHelper {
    /**
     * 获取全部翻译引擎
     */
    static get translateEngines() {
        return Object.keys(translators)
    }

    /**
     * 获取翻译引擎描述
     */
    static getTranslateEngineDescription(engine: TranslateEngine) {
        return translators[engine].description
    }

    /**
     * 翻译
     * @param text 要翻译的文本
     * @param format 是否格式化，默认为 true
     * @param streamCallback 翻译过程中每一次流传输的回调，不会对data进行格式化处理
     * @return 如果翻译失败，则返回原文
     */
    static async translate(
        text: string,
        format: boolean = true,
        streamCallback?: TStreamCallback
    ): Promise<ITranslateResult> {
        // TODO: 给翻译也添加取消signal
        const settings = settingsStore()
        if (!settings.translate.enable) return { ok: false, text }

        const re = await translators[settings.translate.translateEngine].func(
            text,
            settings.translate.targetLanguage,
            streamCallback
        )

        // 如果AI翻译失败，则调用谷歌翻译
        if (!re.ok && settings.translate.retryWithGoogle) {
            LogHelper.warn('AI翻译失败，调用谷歌翻译...')
            const googleRe = await translators.google.func(
                text,
                settings.translate.targetLanguage,
                streamCallback
            )

            return format
                ? { ...googleRe, text: TransHelper.formatTranslateText(googleRe.text) }
                : googleRe
        }

        return format ? { ...re, text: TransHelper.formatTranslateText(re.text) } : re
    }

    /**
     * 获取本地所有翻译模型
     */
    static async getLLMModels(): Promise<[]> {
        const settings = settingsStore()
        const re = await NetHelper.get(
            `http://${settings.translate.localLLM.host}:${settings.translate.localLLM.port}/v1/models`,
            {
                parse: 'json',
                delay: 0,
                retry: 0
            }
        )

        if (re.ok) {
            try {
                return re.body.data
                    .map((item: any) => {
                        return item.id
                    })
                    .sort((a, b) => a.localeCompare(b))
            } catch (e) {
                LogHelper.error(`获取LLM模型失败：`, e)
            }
        }

        LogHelper.error(`获取LLM模型失败：`, re)
        return []
    }

    /**
     * 本地繁体转化为简体
     */
    static translateSC(text: string) {
        return toSimplified(text, true)
    }

    /**
     * 本地简体转化为繁体
     */
    static translateTC(text: string) {
        return toTraditional(text, true)
    }

    /**
     * 格式化翻译文本
     * @param text 翻译文本
     * @description 每一句话之间隔一行，同时句首顶格，全部翻译为简体中文，最后将文本中的转义换行符转为普通换行
     */
    static formatTranslateText(text: string) {
        text = TransHelper.translateSC(text)
        text = EncodeHelper.normalizePlotLineBreak(text)

        return text
            .split(/\n+/)
            .map((line) => line.trim())
            .filter(Boolean)
            .flatMap((line) =>
                (line.match(/[^。！？!?…”\n]*(?:(?:[。！？!?]|……)+”*|$)/g) || [])
                    .map((sentence) => sentence.trim())
                    .filter(Boolean)
            )
            .join('\n\n')
    }
}

// 转义特殊符号
function escapeSpecialSymbols(inputString: string): string {
    const escapedString = inputString.trim().replace(/"/g, '\\\\\\$&')
    return escapedString.replace(/\r\n|\r|\n/g, '\\\\n')
}

function getPrompt(targetLanguage: string) {
    return `
    - 你是一个翻译助手，你会将我说的话翻译成${targetLanguage}。
    - 不要返回md格式，返回纯文本给我。
    - 不要有任何注释、提示、指令，只返回翻译后的文本。
    - 标点符号之类的转为${targetLanguage}语言的标点。
    - 注意联系上下文正确使用人称代词，不要混淆使役态和被动态的主语和宾语。
    - 语句的前后逻辑关系要通顺，不要前后矛盾。
    - 人名使用中文音译。
    - 自行优化排版。`
}

/**
 * gemini的提示词
 */
function getGeminiPrompt(targetLanguage: string) {
    return `${getPrompt(targetLanguage)}
    - 淫秽词汇自行使用更加全年龄的表达。`
}

/**
 * gpt的提示词
 */
function getGptPrompt(targetLanguage: string) {
    return `${getPrompt(targetLanguage)}
    - 如果遇到屏蔽字符比如○、●之类的，请自行联想NSFW词汇。
    - 一定不要包含屏蔽字，比如○、●`
}

/**
 * deepseek的提示词
 */
function getDeepSeekPrompt(targetLanguage: string) {
    return getLLMPrompt(targetLanguage)
}

/**
 * llm的提示词
 */
function getLLMPrompt(targetLanguage: string) {
    return `${getPrompt(targetLanguage)}
    - 如果遇到屏蔽字符比如○、●之类的，请自行联想NSFW色情词汇。
    - 一定不要包含屏蔽字，比如○、●
    - 让语句表达更加NSFW色情。`
}
