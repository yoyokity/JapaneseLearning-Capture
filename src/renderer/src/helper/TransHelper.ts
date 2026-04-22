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

const translators = {
    google: {
        description: '谷歌翻译不需要额外配置',
        func: async (s_text: string, targetLanguage = 'zh-CN'): Promise<ITranslateResult> => {
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
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': String(body.length)
            }

            const re = await NetHelper.post(url, body, {
                headers,
                delay: 500
            })

            if (re.ok) {
                try {
                    const text = normaliseResponse(re.body).text.trim()
                    return {
                        ok: true,
                        text
                    }
                } catch (e) {
                    LogHelper.error(`google翻译返回内容解析失败：`, re.body, e)
                }
            }

            // 翻译失败则原文返回
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
        func: async (s_text: string, targetLanguage = 'zh-CN'): Promise<ITranslateResult> => {
            const settings = settingsStore()

            // url
            const url = `${settings.translate.openai.baseURL.replace(/\/$/, '')}/chat/completions`

            // headers
            const headers = {
                Authorization: `Bearer ${settings.translate.openai.apiKey}`,
                'Content-Type': 'application/json'
            }

            // body
            const body = {
                model: settings.translate.openai.model,
                messages: [
                    {
                        role: 'system',
                        content: getAITranslatePrompt(targetLanguage)
                    },
                    {
                        role: 'user',
                        content: escapeSpecialSymbols(s_text)
                    }
                ],
                temperature: 0.3,
                stream: false
            }

            const re = await NetHelper.post(url, body, {
                parse: 'json',
                headers,
                delay: 500
            })

            if (re.ok) {
                try {
                    const text = parseLLM(re.body.choices[0].message.content).trim()
                    return {
                        ok: true,
                        text
                    }
                } catch (e) {
                    LogHelper.error(`openai翻译返回内容解析失败：`, re.body, e)
                }
            }

            // 翻译失败则原文返回
            return { ok: false, text: s_text }
        }
    },

    gemini: {
        description: 'AI效果好但是很多敏感的部分不给翻译，不给翻译的部分会调用谷歌翻译',
        func: async (s_text: string, targetLanguage = 'zh-CN'): Promise<ITranslateResult> => {
            const settings = settingsStore()

            // url
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${settings.translate.gemini.model}:generateContent`

            // headers
            const headers = {
                'x-goog-api-key': settings.translate.gemini.apiKey,
                'Content-Type': 'application/json'
            }

            // body
            const body = {
                system_instruction: {
                    parts: [
                        {
                            text: getAITranslatePrompt(targetLanguage)
                        }
                    ]
                },
                contents: [
                    {
                        parts: [
                            {
                                text: escapeSpecialSymbols(s_text)
                            }
                        ]
                    }
                ]
            }

            const re = await NetHelper.post(url, body, {
                parse: 'json',
                headers,
                delay: 500
            })

            if (re.ok) {
                try {
                    if (JSON.stringify(re.body.candidates).includes('PROHIBITED_CONTENT')) {
                        throw new Error('布豪！翻译结果包含违禁词，傻逼谷歌不给返回力！')
                    }

                    const text = parseLLM(re.body.candidates[0].content.parts[0].text).trim()
                    return {
                        ok: true,
                        text
                    }
                } catch (e) {
                    LogHelper.error(`gemini翻译返回内容解析失败：`, re.body, e)
                }
            }

            // 翻译失败则原文返回
            return { ok: false, text: s_text }
        }
    },

    localLLM: {
        description: '本地AI大模型，效果好且不用担心敏感内容被屏蔽，需要按照说明安装本地模型',
        func: async (s_text: string, targetLanguage = '简体中文'): Promise<ITranslateResult> => {
            // 先用getLLMModels()测试下本地llm有没有启动
            const models = await TransHelper.getLLMModels()
            if (models.length === 0) {
                return { ok: false, text: s_text }
            }

            const settings = settingsStore()

            // url
            const url = `http://${settings.translate.localLLM.host}:${settings.translate.localLLM.port}/v1/chat/completions`

            // headers
            const headers = {
                'Content-Type': 'application/json'
            }

            // body
            const body = {
                model: settings.translate.localLLM.model,
                messages: [
                    {
                        role: 'system',
                        content: getAITranslatePrompt(targetLanguage)
                    },
                    {
                        role: 'user',
                        content: escapeSpecialSymbols(s_text)
                    }
                ],
                temperature: 0.3,
                top_p: 0.8,
                max_tokens: -1,
                stream: false
            }

            const re = await NetHelper.post(url, body, {
                parse: 'json',
                headers,
                delay: 0,
                retry: 0,
                timeout: 30 * 1000
            })

            if (re.ok) {
                try {
                    const text = parseLLM(re.body.choices[0].message.content).trim()
                    return {
                        ok: true,
                        text
                    }
                } catch (e) {
                    LogHelper.error(`gemini翻译返回内容解析失败：`, re.body, e)
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
     * @return 如果翻译失败，则返回原文
     */
    static async translate(text: string): Promise<ITranslateResult> {
        const settings = settingsStore()
        if (!settings.translate.enable) return { ok: false, text }

        const re = await translators[settings.translate.translateEngine].func(
            text,
            settings.translate.targetLanguage
        )

        // 如果AI翻译失败，则调用谷歌翻译
        if (!re.ok && settings.translate.retryWithGoogle) {
            return await translators.google.func(text, settings.translate.targetLanguage)
        }

        return re
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
}

// 转义特殊符号
function escapeSpecialSymbols(inputString: string): string {
    const escapedString = inputString.trim().replace(/"/g, '\\\\\\$&')
    return escapedString.replace(/\r\n|\r|\n/g, '\\\\n')
}

function parseLLM(inputString: string) {
    // 检查文本是否包含<think>标签
    const thinkRegex = /<think>([\s\S]*?)<\/think>\n?([\s\S]*)/
    const match = inputString.match(thinkRegex)

    // 如果匹配到<think>标签，则返回</think>后面的文本
    if (match && match[2]) {
        return match[2].trim()
    }

    // 如果没有匹配到<think>标签，则返回原文
    return inputString
}

/**
 * 获取 AI 翻译提示词
 */
function getAITranslatePrompt(targetLanguage: string) {
    return `你是一个翻译助手，你会将我说的话翻译成${targetLanguage}。同时不要返回md格式，按照原文的排版格式，返回纯文本给我。标点符号之类的转为${targetLanguage}的标点。注意联系上下文正确使用人称代词，不要混淆使役态和被动态的主语和宾语，不要擅自添加原文中没有的特殊符号，也不要擅自增加或减少换行。如果遇到屏蔽字符比如○之类的，请自行联想色情词汇。`
}
