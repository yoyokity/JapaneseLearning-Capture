import { load as cheerioLoad } from 'cheerio'
import { DataHelper, NetHelper } from '@renderer/helper'
import { Gender, IActor } from './type'

const headers = {
	'User-Agent':
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
	'Upgrade-Insecure-Requests': '1',
	Referer: 'https://javdb.com/',
	Cookie: `over18=1; locale=zh`
}

/**
 * 演员
 */
export class Actor implements IActor {
	name: string
	gender: Gender = 'female'
	imgUrl: string = ''
	birthdate: string = ''
	measurements: string = ''
	cup: string = ''

	constructor(name: string) {
		this.name = name
	}

	/**
	 * 检测网络连通性
	 * @return  连通返回true，否则返回连接失败的站点
	 */
	static async checkConnect(): Promise<boolean | string> {
		const re = await NetHelper.ping('https://ja.wikipedia.org')
		if (re.success) return true
		return 'wiki'
	}

	/**
	 * 返回信息文本
	 */
	infoText() {
		if (!(this.birthdate || this.birthdate || this.cup)) return ''

		let text = `${this.name}:\n`
		if (this.birthdate) text += this.birthdate + '\n'
		if (this.measurements) text += this.measurements
		if (this.cup) text += ' ' + this.cup

		return text
	}

	/**
	 * 搜索演员信息，数据库中存在则直接拿取 (注意是异步函数)
	 * @param {string|null} javDB_url 演员的javdb链接，忽略则根据名字搜索
	 * @param {boolean} female 是否为女人
	 */
	async search(javDB_url: string | null = null, female = true): Promise<void> {
		//检查数据库中是否已有演员信息
		if (await this.get()) {
			return
		}

		if (female) {
			//如果是女的从wiki获取基本信息

			this.gender = 'female'
			const response = await NetHelper.get(
				NetHelper.joinUrl('https://ja.wikipedia.org/wiki/', encodeURIComponent(this.name))
			)
			if (response.ok) {
				const $ = cheerioLoad(response.body)
				const infobox = $('.infobox')
				if (infobox) {
					const text = infobox.text()

					const birthdate = text.match(/\d{4}年\d+月\d+日/)?.[0]
					if (birthdate) {
						this.birthdate = birthdate.trim()
					}

					const measurements = text.match(/[\d ]+-[\d ]+-[\d ]+cm/)?.[0]
					if (measurements) {
						this.measurements = measurements.trim().replace(' ', '')
					}

					const cup = text.match(/[A-Z][0-9]*?\n/)?.[0]
					if (cup) {
						this.cup = cup.trim()
					}
				}
			}
		} else {
			this.gender = 'male'
		}

		//在javdb中获取头像
		if (javDB_url) {
			this.imgUrl = (await getImgFromJavDB(javDB_url)) || ''
		} else {
			//没有url搜索
			const response = await NetHelper.get(
				NetHelper.joinUrl(
					'https://javdb.com/',
					`search?f=actor&q=${encodeURIComponent(this.name)}`
				),
				'text',
				headers
			)

			if (response.ok) {
				const $ = cheerioLoad(response.body)
				const elements = $('div#actors')
				if (elements.length > 0) {
					const a = elements.first().find('a')
					const title = a.attr('title')
					const url = a.attr('href')
					if (title && title.includes(this.name) && url) {
						this.imgUrl = (await getImgFromJavDB(url)) || ''
					}
				}
			}
		}

		await this.set()
	}

	/**
	 * 从数据库中获取演员信息
	 */
	private async get(): Promise<boolean> {
		const data = (await DataHelper.get('#actor', this.name)) as IActor
		if (data) {
			this.imgUrl = data.imgUrl || ''
			this.gender = data.gender || 'female'
			this.birthdate = data.birthdate || ''
			this.measurements = data.measurements || ''
			this.cup = data.cup || ''
			return true
		}
		return false
	}

	/**
	 * 将演员信息存入数据库中
	 */
	private async set() {
		await DataHelper.set('#actor', this.name, this)
	}
}

async function getImgFromJavDB(url: string) {
	const response = await NetHelper.get(
		NetHelper.joinUrl('https://javdb.com/', url),
		'text',
		headers
	)

	if (response.ok) {
		const $ = cheerioLoad(response.body)
		const elements = $('.column.actor-avatar')
		if (elements.length > 0) {
			const url = elements.html()?.match(/https:.+\.jpg/)?.[0]
			if (url) return url
		}
	}
	return null
}
