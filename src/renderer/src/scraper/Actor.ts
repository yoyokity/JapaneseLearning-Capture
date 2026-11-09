import type { IActor } from '@renderer/scraper'

import { DataHelper, NetHelper, StringHelper } from '@renderer/helper'
import { load as cheerioLoad } from 'cheerio'

const avfanUrl = 'https://avfan.mixh.jp'

const avfanRequestOptions = {
    headers: {
        'content-type': 'application/x-www-form-urlencoded',
        Referer: `${avfanUrl}/`
    }
}

const DATA_NAME = '#actor-data'
// 数据版本，递增即失效
const DATA_VERSION = 1

// 启动时清理旧版本数据
void DataHelper.deleteStores(DATA_NAME, `${DATA_NAME}-${DATA_VERSION}`)

// 匹配 background-image 中的图片链接
const backgroundImageRegex = /url\((?<url>[^)]+)\)/

export interface IActorFull extends IActor {
    /**
     * 性别
     */
    gender: 'male' | 'female'
    /**
     * 身高-三围 文本
     */
    height?: string
    /**
     * 出生日期
     */
    born?: string
    /**
     * 出道时间
     */
    debut?: string
}

/**
 * 演员
 */
export class Actor implements IActorFull {
    name: string
    imgUrl: string = ''
    role: string = ''
    gender: 'male' | 'female' = 'female'
    height?: string
    born?: string
    debut?: string

    constructor(name: string, gender: 'male' | 'female') {
        this.name = name
        this.gender = gender
    }

    /**
     * 在avfan中搜索演员信息
     */
    private async searchAvfan(signal: AbortSignal): Promise<boolean> {
        // 搜索演员
        const formData = new URLSearchParams()
        formData.append('search', this.name)
        formData.append('sno', '0')

        const searchResponse = await NetHelper.post(
            `${avfanUrl}/archives/top/search.php`,
            formData.toString(),
            {
                signal,
                ...avfanRequestOptions
            }
        )
        if (!searchResponse.ok) return false

        let $ = cheerioLoad(searchResponse.body)
        const actor = $('a.girls')
            .toArray()
            .map((el) => {
                const item = $(el)
                const href = item.attr('href')?.trim()
                const name = item.find('.a_name').text().trim()
                const style = item.find('.search_card').attr('style') || ''
                const imgUrl =
                    StringHelper.decodeHtmlEntity(style).match(backgroundImageRegex)?.groups?.url
                        ?.trim() || ''

                return { href, name, imgUrl }
            })
            // 有头像的才是有效结果，选择第一个非默认头像的演员
            .find(
                (item) =>
                    item.href && item.name && item.imgUrl && !item.imgUrl.includes('noimg.jpg')
            )

        if (!actor?.href) return false

        // 转到演员页面
        const actorResponse = await NetHelper.get(actor.href, { signal })
        if (!actorResponse.ok) return false

        // 解析演员信息
        $ = cheerioLoad(actorResponse.body)
        const data = new Map<string, string>()
        $('dl#status dt').each((_, el) => {
            const key = $(el).text().replace(/\s/g, '')
            const value = $(el).next('dd').text().trim()
            if (key && value) data.set(key, value)
        })

        // 忽略未知信息（站点用 × 表示）
        const normalizeValue = (value?: string) => {
            if (!value || value.includes('×')) return undefined
            return value
        }

        const height = ['身長', 'ＢＷＨ', 'カップ']
            .map((key) => normalizeValue(data.get(key)))
            .filter(Boolean)
            .join(' ')
        this.height = height || undefined
        this.born = normalizeValue(data.get('誕生日'))
        this.debut = normalizeValue(data.get('debut'))

        // 获取演员头像
        const imgUrl = $('header img#timg').attr('src')?.trim()
        this.imgUrl = imgUrl ? StringHelper.decodeHtmlEntity(imgUrl) : actor.imgUrl

        return true
    }

    /**
     * 搜索演员信息，数据库中存在则直接拿取 (注意是异步函数)
     * @param {AbortSignal} signal 取消信号
     */
    async search(signal: AbortSignal): Promise<void> {
        // 检查数据库中是否已有完整信息
        if (await this.get()) return

        const complete = await this.searchAvfan(signal)

        // 信息不完整时不缓存，站点更新后可重新获取
        if (complete && this.hasCompleteInfo()) await this.set()
    }

    /**
     * 判断演员信息是否完整
     */
    private hasCompleteInfo() {
        return Boolean(this.imgUrl && this.height && this.born && this.debut)
    }

    /**
     * 将演员信息转换为字符串
     */
    toString() {
        if (this.height || this.born || this.debut) {
            let text = `${this.name}${this.born ? ` (${this.born})` : ''}\n\n`
            if (this.height) text += `- 身高三围: ${this.height}\n\n`
            if (this.debut) text += `- 出道时间: ${this.debut}`

            return `\n\n----------------\n\n${text}`
        }

        return ''
    }

    /**
     * 从数据库中获取演员信息
     */
    private async get(): Promise<boolean> {
        const data = await DataHelper.get<IActorFull>(
            `${DATA_NAME}-${DATA_VERSION}`,
            this.name
        )
        if (!data) return false

        this.imgUrl = data.imgUrl || ''
        this.role = data.role || ''
        this.gender = data.gender || 'female'
        this.height = data.height || ''
        this.born = data.born || ''
        this.debut = data.debut || ''

        // 信息不完整时重新获取
        return this.hasCompleteInfo()
    }

    /**
     * 将演员信息存入数据库中
     */
    private async set() {
        const data: IActorFull = {
            name: this.name,
            imgUrl: this.imgUrl,
            role: this.role,
            gender: this.gender,
            height: this.height,
            born: this.born,
            debut: this.debut
        }
        await DataHelper.set(`${DATA_NAME}-${DATA_VERSION}`, this.name, data)
    }
}
