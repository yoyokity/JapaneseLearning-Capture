import type { IHanimeContent } from './temp'

import { EncodeHelper, ImageHelper, NetHelper } from '@renderer/helper'
import { load as cheerioLoad } from 'cheerio'

import { loggerGetchu } from './temp'

export const getchuOptions = {
    headers: { referer: 'https://www.getchu.com' },
    cookie: { _gat: '1', getchu_adalt_flag: 'getchu.com' }
}

/**
 * Getchu
 */
export async function getWebContentGetchu(
    searchTitle: string,
    content: IHanimeContent
): Promise<string | null> {
    loggerGetchu.log(`开始获取网页内容`)

    /**
     * 获取 Getchu 页面内容
     */
    async function fetchPage(url: string): Promise<string | null> {
        const res = await NetHelper.get(url, { ...getchuOptions, parse: 'arrayBuffer' })
        if (!res.ok) {
            return null
        }
        return EncodeHelper.decodeEucJp(res.body)
    }

    //先使用编号搜索
    if (content.num.getchu) {
        const url = `https://www.getchu.com/item/${content.num.getchu}/?gc=gc`
        loggerGetchu.log(`使用编号搜索：${content.num.getchu}`)

        const body = await fetchPage(url)
        if (body) {
            if (body.includes('年齢認証')) {
                loggerGetchu.warn(`成人验证失败，无法获取网页内容`, url)
                return null
            }

            loggerGetchu.success(`获取到网页内容`)
            return body
        }
        loggerGetchu.log(`使用编号搜索失败，使用原标题搜索`, url)
    }

    //如果编号搜索失败，则使用原标题搜索
    const searchKeyword = await EncodeHelper.encodeUrlEucJp(searchTitle)
    const searchUrl = `https://www.getchu.com/php/search.phtml?aurl=https://www.getchu.com/php/search.phtml&genre=anime_dvd&search_keyword=${searchKeyword}&check_key_dtl=1&submit=&gc=gc`

    const searchBody = await fetchPage(searchUrl)
    if (!searchBody) {
        loggerGetchu.warn(`获取搜索结果失败`, searchUrl)
        return null
    }

    //在视频列表中找到符合条件的第一个
    const $ = cheerioLoad(searchBody)
    const videoList = $('td > a.blueb[href*="/soft.phtml?id="]')

    loggerGetchu.log(`搜索到${videoList.length}个番剧作为候选项：`, searchUrl)
    videoList.each((_, el) => loggerGetchu.log(`【${$(el).text().trim()}】`))

    const target = videoList.filter((_, el) => $(el).text().trim().includes(searchTitle)).first()
    const href = target.attr('href')
    if (!href) {
        loggerGetchu.warn(`没有找到匹配的番剧`)
        return null
    }
    const id = href.match(/[?&]id=(?<id>\d+)/)?.groups?.id
    if (!id) {
        loggerGetchu.warn(`没有找到匹配的番剧`)
        return null
    }

    const fullUrl = NetHelper.joinUrl('https://www.getchu.com/item', id, '?gc=gc')
    loggerGetchu.log(`找到匹配的番剧：【${target.text().trim()}】 ${fullUrl}`)

    //根据href获取webContent
    const body = await fetchPage(fullUrl)
    if (!body) {
        loggerGetchu.warn(`获取网页内容失败`, fullUrl)
        return null
    }

    if (body.includes('年齢認証')) {
        loggerGetchu.warn(`成人验证失败，无法获取网页内容`, fullUrl)
        return null
    }

    //记录num
    content.num.getchu = id

    loggerGetchu.success(`获取到网页内容`)
    return body
}

/**
 * 获取 Getchu 剧照
 */
export async function getExtrafanartGetchu(content: IHanimeContent): Promise<string[]> {
    if (!content.webContent.getchu) {
        loggerGetchu.log(`- 没有getchu，无法获取剧照`)
        return []
    }

    const $ = cheerioLoad(content.webContent.getchu)
    const hrefs = $('div.item-Samplecard a').map((_, el) => $(el).attr('href')?.trim())

    const urls = hrefs
        .toArray()
        .filter((href): href is string => !!href)
        .map((href) => NetHelper.joinUrl('https://www.getchu.com/', href))

    const extrafanart: string[] = []
    const successUrls: string[] = []
    const failedUrls: string[] = []
    for (const url of urls) {
        const re = await NetHelper.getImage(url, getchuOptions)
        if (re.ok) {
            successUrls.push(url)
            const tempPath = await ImageHelper.saveTempImage(
                re.body,
                `getchu_extrafanart_${Date.now()}`
            )
            if (tempPath) extrafanart.push(tempPath)
        } else {
            failedUrls.push(url)
        }
    }

    if (successUrls.length > 0) {
        loggerGetchu.log(`获取${successUrls.length}张剧照成功`)
    }

    if (failedUrls.length > 0) {
        loggerGetchu.warn(`获取${failedUrls.length}张剧照失败`, failedUrls)
    }

    return extrafanart
}

/**
 * 获取 Getchu 封面
 */
export async function getPosterGetchu(content: IHanimeContent): Promise<string | null> {
    if (!content.webContent.getchu) {
        return null
    }

    const $ = cheerioLoad(content.webContent.getchu)
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
        loggerGetchu.warn(`获取封面失败！:${posterUrl}`)
        return null
    }

    loggerGetchu.log(`获取封面成功！:${posterUrl}`)
    return ImageHelper.saveTempImage(re.body, `getchu_poster_${Date.now()}`)
}
