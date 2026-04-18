import type { IActor } from '@renderer/scraper'

import { DataHelper, EncodeHelper, NetHelper } from '@renderer/helper'
import { load as cheerioLoad } from 'cheerio'

const requestOptions = {
    headers: {
        'Upgrade-Insecure-Requests': '1',
        Referer: 'https://javdb.com/'
    },
    cookie: { over18: '1', locale: 'zh' }
}

/**
 * 演员
 */
export class Actor implements IActor {
    name: string
    imgUrl: string = ''
    role: string = ''

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
     * 搜索演员信息，数据库中存在则直接拿取 (注意是异步函数)
     * @param {string|null} javDB_url 演员的javdb链接，忽略则根据名字搜索
     */
    async search(javDB_url: string | null = null): Promise<void> {
        //检查数据库中是否已有演员信息
        if (await this.get()) {
            return
        }

        //在javdb中获取头像
        if (javDB_url) {
            this.imgUrl = (await getImgFromJavDB(javDB_url)) || ''
        } else {
            //没有url搜索
            const response = await NetHelper.get(
                NetHelper.joinUrl(
                    'https://javdb.com/',
                    `search?f=actor&q=${EncodeHelper.encodeUrl(this.name)}`
                ),
                requestOptions
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
            this.role = data.role || ''
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
        requestOptions
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
