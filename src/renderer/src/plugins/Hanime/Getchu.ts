import type { IVideo } from '@renderer/scraper'

import { DebugHelper, ImageHelper, NetHelper } from '@renderer/helper'
import { load as cheerioLoad } from 'cheerio'

import { temp } from './temp'

export const getchuOptions = {
    headers: { referer: 'https://www.getchu.com' },
    cookie: { _gat: '1', getchu_adalt_flag: 'getchu.com' }
}

/**
 * Getchu
 */
export async function getWebContentGetchu(video: IVideo): Promise<string | null> {
    DebugHelper.log(`- [Getchu] 开始获取网页内容`)

    /**
     * 解码 EUC-JP 编码的 ArrayBuffer
     */
    function decodeEucJp(buffer: ArrayBuffer): string {
        return new TextDecoder('EUC-JP').decode(new Uint8Array(buffer))
    }

    /**
     * 获取 Getchu 页面内容
     */
    async function fetchPage(url: string): Promise<string | null> {
        const res = await NetHelper.get(url, { ...getchuOptions, parse: 'arrayBuffer' })
        if (!res.ok) {
            return null
        }
        return decodeEucJp(res.body)
    }

    //先使用编号搜索
    if (temp.num.getchu) {
        const url = `https://www.getchu.com/soft.phtml?id=${temp.num.getchu}&gc=gc`
        DebugHelper.log(`- [Getchu] 使用编号搜索：${temp.num.getchu}`)

        const body = await fetchPage(url)
        if (body) {
            if (body.includes('年齢認証')) {
                DebugHelper.warn(`- [Getchu] 成人验证失败，无法获取网页内容`)
                return null
            }

            DebugHelper.info(`- [Getchu] 获取到网页内容`)
            return body
        }
        DebugHelper.log(`- [Getchu] 使用编号搜索失败，使用原标题搜索`)
    }

    //如果编号搜索失败，则使用原标题搜索
    const searchUrl = `https://www.getchu.com/php/search.phtml?aurl=https://www.getchu.com/php/search.phtml&genre=anime_dvd&search_keyword=${encodeURIComponent(video.originaltitle)}&check_key_dtl=1&submit=&gc=gc`

    const searchBody = await fetchPage(searchUrl)
    if (!searchBody) {
        DebugHelper.warn(`- [Getchu] 获取搜索结果失败`)
        return null
    }

    //在视频列表中找到符合条件的第一个
    const $ = cheerioLoad(searchBody)
    const videoList = $('td > a.blueb[href*="/soft.phtml?id="]')

    DebugHelper.log(`- [Getchu] 搜索到${videoList.length}个番剧作为候选项：`)
    videoList.each((_, el) => DebugHelper.log(`- [Getchu] 【${$(el).text().trim()}】`))

    const target = videoList
        .filter((_, el) => $(el).text().trim().includes(video.originaltitle))
        .first()
    const href = target.attr('href')
    if (!href) {
        DebugHelper.warn(`- [Getchu] 没有找到匹配的番剧`)
        return null
    }
    const id = href.match(/[?&]id=(?<id>\d+)/)?.groups?.id
    if (!id) {
        DebugHelper.warn(`- [Getchu] 没有找到匹配的番剧`)
        return null
    }

    const fullUrl = NetHelper.joinUrl('https://www.getchu.com/item', id, '?gc=gc')
    DebugHelper.log(`- [Getchu] 找到匹配的番剧：【${target.text().trim()}】 ${fullUrl}`)

    //根据href获取webContent
    const body = await fetchPage(fullUrl)
    if (!body) {
        DebugHelper.warn(`- [Getchu] 获取网页内容失败`)
        return null
    }

    if (body.includes('年齢認証')) {
        DebugHelper.warn(`- [Getchu] 成人验证失败，无法获取网页内容`)
        return null
    }

    //记录num
    temp.num.getchu = id

    DebugHelper.info(`- [Getchu] 获取到网页内容`)
    return body
}

/**
 * 获取 Getchu 剧照
 */
export async function getExtrafanartGetchu(): Promise<string[]> {
    if (!temp.webContent.getchu) {
        DebugHelper.log(`- 没有getchu，无法获取剧照`)
        return []
    }

    const $ = cheerioLoad(temp.webContent.getchu)
    const hrefs = $('div.item-Samplecard a').map((_, el) => $(el).attr('href')?.trim())

    const urls = hrefs
        .toArray()
        .filter((href): href is string => !!href)
        .map((href) => NetHelper.joinUrl('https://www.getchu.com/', href))

    const extrafanart: string[] = []
    for (const url of urls) {
        const re = await NetHelper.getImage(url, getchuOptions)
        if (re.ok) {
            DebugHelper.log(`- [Getchu] 获取剧照成功！:${url}`)
            const tempPath = await ImageHelper.saveTempImage(
                re.body,
                `getchu_extrafanart_${Date.now()}`
            )
            if (tempPath) extrafanart.push(tempPath)
        } else {
            DebugHelper.warn(`- [Getchu] 获取剧照失败！:${url}`)
        }
    }

    return extrafanart
}

/**
 * 获取 Getchu 封面
 */
export async function getPosterGetchu(): Promise<string | null> {
    if (!temp.webContent.getchu) {
        return null
    }

    const $ = cheerioLoad(temp.webContent.getchu)
    const url = $('table#soft_table')
        .find('a')
        .first()
        .attr('href')
        ?.replace(/^\.\/ */, '')

    if (!url) {
        return null
    }

    const posterUrl = NetHelper.joinUrl('https://www.getchu.com/', url)
    const re = await NetHelper.getImage(posterUrl, getchuOptions)
    if (!re.ok) {
        DebugHelper.warn(`- [Getchu] 获取封面失败！:${posterUrl}`)
        return null
    }

    DebugHelper.log(`- [Getchu] 获取封面成功！:${posterUrl}`)
    return ImageHelper.saveTempImage(re.body, `getchu_poster_${Date.now()}`)
}
