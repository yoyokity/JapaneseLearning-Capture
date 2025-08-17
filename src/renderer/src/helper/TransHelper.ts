import { toSimplified, toTraditional } from 'chinese-simple2traditional'
import { setupEnhance } from 'chinese-simple2traditional/enhance'
import { NetHelper } from '@renderer/helper/NetHelper.ts'
import { DebugHelper } from '@renderer/helper/DebugHelper.ts'
import { settingsStore } from '@renderer/stores/settings.ts'

// 注入短语库，提高准确性
setupEnhance()

export type TranslateEngine = keyof typeof translators
export type TranslateTargetLanguage = 'zh-CN' | 'zh-TW'
export interface ITranslateSettings {
	enable: boolean
	targetLanguage: TranslateTargetLanguage
	translateEngine: TranslateEngine
	gemini: {
		apiKey: string
		model: string
	}
}

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
	 * 翻译
	 * @return 如果翻译失败，则返回原文
	 */
	static async translate(text: string) {
		const settings = settingsStore()
		if (!settings.translate.enable) return text
		return await translators[settings.translate.translateEngine](
			text,
			settings.translate.targetLanguage
		)
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

const translators = {
	google: async (s_text: string, targetLanguage = 'zh-CN'): Promise<string> => {
		const translateOptions = {
			from: 'auto',
			to: targetLanguage,
			hl: 'zh-CN', // Host language
			tld: 'com',
			rpcids: 'MkEWBc'
		}

		//url
		const searchParams = new URLSearchParams({
			rpcids: translateOptions.rpcids,
			'source-path': '/',
			hl: translateOptions.hl,
			'soc-app': '1',
			'soc-platform': '1',
			'soc-device': '1'
		})
		const url = `https://translate.google.${translateOptions.tld}/_/TranslateWebserverUi/data/batchexecute?${searchParams}`

		//body
		const normalizedText = escapeSpecialSymbols(s_text)
		const encodedData = encodeURIComponent(
			`[[["${translateOptions.rpcids}","[[\\"${normalizedText}\\",\\"${translateOptions.from}\\",\\"${translateOptions.to}\\",1],[]]",null,"generic"]]]`
		)
		const body = `f.req=${encodedData}&`

		//headers
		const headers = {
			'Content-Type': 'application/x-www-form-urlencoded',
			'Content-Length': String(body.length)
		}

		const re = await NetHelper.post(url, body, 'text', headers, {
			delay: 500
		})

		if (re.ok) {
			try {
				return normaliseResponse(re.body).text
			} catch (e) {
				DebugHelper.error(`google翻译返回内容解析失败：`, re.body, e)
			}
		}

		// 翻译失败则原文返回
		return s_text

		function parseData(data: string) {
			try {
				const content = JSON.parse(data.replace(/^\)]}'/, ''))
				const translationResponse = JSON.parse(content[0][2])

				return translationResponse
			} catch (e) {
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
	},
	gemini: async (s_text: string, targetLanguage = 'zh-CN'): Promise<string> => {
		const settings = settingsStore()

		//url
		const url = `https://generativelanguage.googleapis.com/v1beta/models/${settings.translate.gemini.model}:generateContent`

		//headers
		const headers = {
			'x-goog-api-key': settings.translate.gemini.apiKey,
			'Content-Type': 'application/json'
		}

		//body
		const body = {
			system_instruction: {
				parts: [
					{
						text: `你是一个翻译助手，你会将我说的话翻译成${targetLanguage}。同时不要返回md格式，按照原文的排版格式，返回纯文本给我。标点符号之类的转为${targetLanguage}的标点。`
					}
				]
			},
			contents: [
				{
					parts: [
						{
							text: `${escapeSpecialSymbols(s_text)} `
						}
					]
				}
			]
		}

		const re = await NetHelper.post(url, body, 'json', headers, {
			delay: 500
		})

		if (re.ok) {
			try {
				if (JSON.stringify(re.body['candidates']).includes('PROHIBITED_CONTENT')) {
					throw new Error('布豪！翻译结果包含违禁词，傻逼谷歌不给返回力！')
				}

				return re.body['candidates'][0]['content']['parts'][0]['text']
			} catch (e) {
				DebugHelper.error(`gemini翻译返回内容解析失败：`, re.body, e)
			}
		}

		// 翻译失败则原文返回
		return s_text
	}
} as const

//转义特殊符号
function escapeSpecialSymbols(inputString: string): string {
	const escapedString = inputString.trim().replace(/"/g, '\\\\\\$&')
	return escapedString.replace(/\r\n|\r|\n/g, '\\\\n')
}
