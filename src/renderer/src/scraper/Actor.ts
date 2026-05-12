import type { IActor } from '@renderer/scraper'

import { DataHelper, EncodeHelper, NetHelper } from '@renderer/helper'
import { load as cheerioLoad } from 'cheerio'

const javDBRequestOptions = {
    headers: {
        'Upgrade-Insecure-Requests': '1',
        Referer: 'https://javdb.com/'
    },
    cookie: { over18: '1', locale: 'zh' }
}

const gravurefitRequestOptions = {
    headers: {
        'content-type': 'application/x-www-form-urlencoded',
        Origin: 'https://www.gravurefit.com',
        Referer: 'https://www.gravurefit.com/searchp/'
    }
}

const DATA_NAME = '#actor-data'

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
     * 在gravurefit中获取演员信息
     */
    private async searchGravurefit(signal: AbortSignal): Promise<boolean> {
        // 先搜索演员列表
        const formData = new URLSearchParams()
        formData.append('search', this.name)

        const response = await NetHelper.post(
            'https://www.gravurefit.com/searchp/',
            formData.toString(),
            {
                signal,
                ...gravurefitRequestOptions
            }
        )
        if (signal.aborted) return false
        if (!response.ok) return false

        let $ = cheerioLoad(response.body)
        const actorList = $('tbody a')
            .toArray()
            .map((el) => {
                const item = $(el)
                const href = item.attr('href')?.trim()
                return {
                    href: href ? NetHelper.joinUrl('https://www.gravurefit.com/', href) : undefined,
                    title: item.text().trim()
                }
            })
            .filter((item): item is { href: string; title: string } => !!item.href && !!item.title)

        // 找到最佳匹配演员
        const match = EncodeHelper.bestMatch(
            this.name,
            actorList.map((item) => item.title)
        )
        if (!match) return false

        // 转到演员页面
        const actorResponse = await NetHelper.get(actorList[match.index].href, {
            signal
        })
        if (signal.aborted) return false
        if (!actorResponse.ok) return false

        // 解析演员信息
        $ = cheerioLoad(actorResponse.body)
        const data = $('section tbody tr')
            .toArray()
            .map((el) => {
                const item = $(el)
                return {
                    key: item.find('th').text().trim(),
                    value: item.find('td').text().trim()
                }
            })
            .filter((item): item is { key: string; value: string } => !!item.key && !!item.value)

        for (const { key, value } of data) {
            if (key.includes('身長')) {
                this.height = value
                continue
            }

            if (key.includes('生年月日')) {
                this.born = value.match(/(\d{4}年\d{1,2}月\d{1,2}日)/)?.[1] || ''
                continue
            }

            if (key.includes('デビュー')) {
                this.debut = value
                continue
            }
        }

        // 获取演员头像
        const imgUrl = $('div.photopc img').attr('src')?.trim()
        if (imgUrl) this.imgUrl = NetHelper.joinUrl('https://www.gravurefit.com/', imgUrl)

        return true
    }

    /**
     * 在javdb中获取演员头像
     */
    private async searchJavDB(
        signal: AbortSignal,
        javDB_url: string | null = null
    ): Promise<boolean> {
        // 如果有javdb_url，直接从演员页面获取头像
        if (javDB_url) {
            const response = await NetHelper.get(javDB_url, {
                signal,
                ...javDBRequestOptions
            })
            if (signal.aborted) return false
            if (response.ok) {
                const $ = cheerioLoad(response.body)
                const img = $('span.avatar')
                    .attr('style')
                    ?.match(/https:.+\.jpg/)?.[0]

                if (img) this.imgUrl = img
            }

            return true
        }

        // 没有url则搜索
        const response = await NetHelper.get(
            `https://javdb.com/search?f=actor&q=${EncodeHelper.encodeUrl(this.name)}`,
            {
                signal,
                ...javDBRequestOptions
            }
        )
        if (signal.aborted) return false
        if (!response.ok) return false

        const $ = cheerioLoad(response.body)
        const actorList = $('div#actors a')
            .toArray()
            .map((el) => {
                const item = $(el)
                const href = item.find('img.avatar').attr('src')?.trim()

                return {
                    href: href?.includes('actor_unknow') ? '' : href,
                    title: item.find('strong').text().trim()
                }
            })
            .filter((item): item is { href: string; title: string } => !!item.title)

        const bestMatch = EncodeHelper.bestMatch(
            this.name,
            actorList.map((item) => item.title)
        )

        if (bestMatch) {
            this.imgUrl = actorList[bestMatch.index].href || ''
            return true
        }

        return false
    }

    /**
     * 搜索演员信息，数据库中存在则直接拿取 (注意是异步函数)
     * @param {AbortSignal} signal 取消信号
     * @param {string|null} javDB_url 演员的javdb完整链接，忽略则根据名字搜索
     */
    async search(signal: AbortSignal, javDB_url: string | null = null): Promise<void> {
        // 检查数据库中是否已有演员信息
        if (await this.get()) return

        // 检查演员信息是否完整
        const complete =
            this.gender === 'male'
                ? await this.searchJavDB(signal, javDB_url)
                : (await this.searchGravurefit(signal)) &&
                  (await this.searchJavDB(signal, javDB_url))

        // 存储演员信息到数据库
        if (complete) await this.set()
    }

    /**
     * 将演员信息转换为字符串
     */
    toString() {
        if (this.height || this.born || this.debut) {
            let text = `${this.name}\n`
            if (this.height) text += `身高三围: ${this.height}\n`
            if (this.born) text += `出生日期: ${this.born}\n`
            if (this.debut) text += `出道时间: ${this.debut}\n`

            return text
        }

        return ''
    }

    /**
     * 从数据库中获取演员信息
     */
    private async get(): Promise<boolean> {
        const data = await DataHelper.get<IActorFull>(DATA_NAME, this.name)
        if (data) {
            this.imgUrl = data.imgUrl || ''
            this.role = data.role || ''
            this.gender = data.gender || 'female'
            this.height = data.height || ''
            this.born = data.born || ''
            this.debut = data.debut || ''
            return true
        }
        return false
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
        await DataHelper.set(DATA_NAME, this.name, data)
    }
}
