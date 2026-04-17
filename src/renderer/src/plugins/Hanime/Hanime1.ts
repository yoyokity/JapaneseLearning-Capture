import { EncodeHelper, ImageHelper, NetHelper } from '@renderer/helper'
import { load as cheerioLoad } from 'cheerio'

import { loggerHanime1, temp } from './temp'

export async function searchVideoHanime1(
    searchTitle: string
): Promise<{ href: string; poster: string | undefined } | null> {
    const url = `https://hanime1.me/search?query=${EncodeHelper.encodeUrl(searchTitle)}&genre=${EncodeHelper.encodeUrl('裏番')}`
    const webContent = await NetHelper.get(url)
    if (!webContent.ok) {
        loggerHanime1.warn(`获取搜索结果失败`, url)
        return null
    }

    const $ = cheerioLoad(webContent.body)
    const videoList = $('.home-rows-videos-wrapper > a').filter(
        '[href^="https://hanime1.me/watch?v="]'
    )

    loggerHanime1.log(`搜索到${videoList.length}个番剧作为候选项`)
    videoList.each((_, el) => loggerHanime1.log(`【${$(el).text().trim().trim()}】`))

    const firstVideo = videoList.first()
    const href = firstVideo.attr('href')
    if (!href) {
        loggerHanime1.warn(`没有找到匹配的番剧`)
        return null
    }

    const poster = firstVideo.find('img').attr('src')
    loggerHanime1.log(`找到匹配的番剧：【${firstVideo.text().trim()}】 ${href}`)
    return { href, poster }
}

/**
 * Hanime1
 */
export async function getWebContentHanime1(searchTitle: string): Promise<string | null> {
    loggerHanime1.log(`开始获取网页内容`)

    //先使用编号搜索
    if (temp.num.hanime1) {
        const url = `https://hanime1.me/watch?v=${temp.num.hanime1}`
        loggerHanime1.log(`使用编号搜索：${temp.num.hanime1}`)

        const webContent = await NetHelper.get(url)
        if (webContent.ok) {
            loggerHanime1.success(`获取到网页内容`)
            return webContent.body
        }
        loggerHanime1.log(`使用编号搜索失败，使用原标题搜索`, url)
    }

    //如果编号搜索失败，则使用原标题搜索
    const searchResult = await searchVideoHanime1(searchTitle)
    if (!searchResult) {
        loggerHanime1.warn(`获取网页内容失败`)
        return null
    }

    if (searchResult.poster) {
        const re = await NetHelper.getImage(searchResult.poster)
        if (re.ok) {
            temp.封面 = await ImageHelper.saveTempImage(re.body, `hanime1_poster_${Date.now()}`)
        }
    }

    //获取目标视频的webContent
    const webContent = await NetHelper.get(searchResult.href)
    if (!webContent.ok) {
        loggerHanime1.warn(`获取网页内容失败`)
        return null
    }

    //记录num
    temp.num.hanime1 = searchResult.href.split('watch?v=')[1]

    loggerHanime1.success(`获取到网页内容`)
    return webContent.body
}

/**
 * 获取 Hanime1 封面
 */
export async function getPosterHanime1(searchTitle: string): Promise<string | null> {
    const searchResult = await searchVideoHanime1(searchTitle)
    if (!searchResult?.poster) {
        loggerHanime1.warn(`没有找到封面`)
        return null
    }

    const re = await NetHelper.getImage(searchResult.poster)
    if (!re.ok) {
        loggerHanime1.warn(`获取封面失败！:${searchResult.poster}`)
        return null
    }

    loggerHanime1.log(`获取封面成功！:${searchResult.poster}`)
    return ImageHelper.saveTempImage(re.body, `hanime1_poster_${Date.now()}`)
}
