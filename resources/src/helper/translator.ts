import { toSimplified } from 'chinese-simple2traditional'
import { setupEnhance } from 'chinese-simple2traditional/enhance'
import { HttpClient } from '@/helper/request.ts'

// 注入短语库，提高准确性
setupEnhance()

export class Translator {
	/**
	 * 是否启用翻译
	 */
	static translateOn = false
	static translateEngine = 'google'

	static translate(text: string) {}

	/**
	 * 繁体转化为简体
	 */
	static translateSC(text: string) {
		return toSimplified(text, true)
	}
}

const translators = {
	google: async (s_text: string, targetLanguage = 'zh-CN'): Promise<string | Error> => {
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

		try {
			const session = HttpClient.create('')
			let res = await session.post<any>(url, form, headers)
			let sentences = res['sentences']
			if (sentences.length === 2) {
				return sentences[0].trans
			} else {
				let text = ''
				for (let i = 0; i < sentences.length - 1; i++) {
					text += sentences[i].trans
				}
				return text
			}
		} catch (e) {
			return e
		}
	}
}
