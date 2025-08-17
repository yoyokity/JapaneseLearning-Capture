import { toSimplified } from 'chinese-simple2traditional'
import { setupEnhance } from 'chinese-simple2traditional/enhance'
import { NetHelper } from '@renderer/helper/NetHelper.ts'

// 注入短语库，提高准确性
setupEnhance()

type TranslateEngine = keyof typeof translators

/**
 * 翻译相关
 */
export class TransHelper {
	/**
	 * 是否启用翻译
	 */
	static translateOn = false
	static translateEngine: TranslateEngine = 'google'

	/**
	 * 翻译
	 * @return 如果翻译失败，则返回原文
	 */
	static async translate(text: string) {
		if (!this.translateOn) return text
		return await translators[this.translateEngine](text)
	}

	/**
	 * 繁体转化为简体
	 */
	static translateSC(text: string) {
		return toSimplified(text, true)
	}
}

const translators = {
	google: async (s_text: string, targetLanguage = 'zh-CN'): Promise<string> => {
		const url = [
			`https://translate.google.com/translate_a/single`,
			'?client=at',
			'&dt=t',
			'&dt=rm',
			'&dj=1'
		].join('')
		const headers = {
			'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
		}
		const form = {
			sl: 'auto',
			tl: targetLanguage,
			q: s_text
		}

		const re = await NetHelper.post(url, form, 'text', false, headers)
		if (re.ok) {
			let sentences = re.body['sentences']
			if (sentences.length === 2) {
				return sentences[0].trans
			} else {
				let text = ''
				for (let i = 0; i < sentences.length - 1; i++) {
					text += sentences[i].trans
				}
				return text
			}
		}

		// 翻译失败则原文返回
		return s_text
	}
} as const
