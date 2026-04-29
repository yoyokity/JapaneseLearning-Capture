import type { IHanimeContext } from './temp'

import { EncodeHelper, ImageHelper, NetHelper } from '@renderer/helper'
import { load as cheerioLoad } from 'cheerio'

import { loggerDlsite } from './temp'

export const dlsiteOptions = {
    headers: {
        'Upgrade-Insecure-Requests': '1',
        referer: 'https://www.dlsite.com'
    },
    cookie: { adultchecked: '1' }
}

/**
 * Dlsite
 */
export async function getWebContentDlsite(
    searchTitle: string,
    context: IHanimeContext,
    signal: AbortSignal
): Promise<void> {
    loggerDlsite.log(`开始获取网页内容`)

    // 先使用编号搜索
    if (context.num.dlsite) {
        const url = `https://www.dlsite.com/pro/work/=/product_id/${context.num.dlsite}.html?locale=ja_JP`

        loggerDlsite.log(`使用编号搜索：${context.num.dlsite}`)
        const webContent = await NetHelper.get(url, { ...dlsiteOptions, signal })
        if (signal.aborted) return
        if (webContent.ok) {
            context.webContent.dlsite = webContent.body
            loggerDlsite.success(`获取到网页内容`)
            return
        }

        loggerDlsite.log(`使用编号搜索失败，使用原标题搜索`, url)
    }

    // 如果编号搜索失败，则使用原标题搜索
    searchTitle = EncodeHelper.fullToHalf(searchTitle) // 转半角
    const keyword = EncodeHelper.encodeUrl(searchTitle).replace(/%20/g, '+')
    const searchUrl = `https://www.dlsite.com/pro/fsr/=/language/jp/sex_category[0]/male/keyword/${keyword}/ana_flg/all/order/trend/work_type_category[0]/movie/options_and_or/and/options[0]/JPN/options[1]/CHI/options[2]/CHI_HANS/options[3]/CHI_HANT/options[4]/NM/from/fs.header`
    const webContent = await NetHelper.get(searchUrl, { ...dlsiteOptions, signal })
    if (signal.aborted) return
    if (!webContent.ok) {
        loggerDlsite.warn(`获取搜索结果失败`, searchUrl)
        return
    }

    // 在视频列表中找到匹配度最高的
    const $ = cheerioLoad(webContent.body)
    const videoList = $('ul#search_result_img_box > li .multiline_truncate a')
    const candidates = videoList.toArray().map((el) => ({
        title: $(el).text().trim(),
        href: $(el).attr('href')?.trim()
    }))

    loggerDlsite.log(`搜索到${videoList.length}个番剧作为候选项：`, searchUrl)
    candidates.forEach((item) => loggerDlsite.log(`【${item.title}】`))

    const matchedTitle = EncodeHelper.bestMatch(
        searchTitle,
        candidates.map((item) => item.title)
    )
    if (!matchedTitle) {
        loggerDlsite.warn(`没有找到匹配的番剧`)
        return
    }

    const href = candidates.find((item) => item.title === matchedTitle)!.href!
    loggerDlsite.log(`找到匹配的番剧：【${matchedTitle}】 ${href}`)

    // 根据href获取webContent
    const body = await NetHelper.get(href, { ...dlsiteOptions, signal })
    if (signal.aborted) return
    if (!body.ok) {
        loggerDlsite.warn(`获取网页内容失败`, href)
        return
    }

    // 记录num
    context.num.dlsite = href.split('/product_id/')[1].split('.')[0]
    context.webContent.dlsite = body.body

    loggerDlsite.success(`获取到网页内容`)
}

/**
 * 获取 Dlsite 剧照
 */
export async function getExtrafanartDlsite(
    context: IHanimeContext,
    signal: AbortSignal
): Promise<string[]> {
    if (!context.webContent.dlsite) {
        loggerDlsite.log(`- 没有dlsite，无法获取剧照`)
        return []
    }

    const $ = cheerioLoad(context.webContent.dlsite)
    const hrefs = $('.product-slider-data')
        .children()
        .map((_, el) => $(el).attr('data-src'))
        .get()
        .filter((src) => !src.includes('_main.'))
        .map((href) => `https:${href.trim()}`)

    // TODO 统一下载
    const extrafanart: string[] = []
    const successUrls: string[] = []
    const failedUrls: string[] = []
    for (const url of hrefs) {
        const re = await NetHelper.getImage(url, { ...dlsiteOptions, signal })
        if (signal.aborted) break
        if (re.ok) {
            successUrls.push(url)
            const tempPath = await ImageHelper.saveTempImage(re.body, `dlsite_extrafanart`)
            if (tempPath) extrafanart.push(tempPath)
        } else {
            failedUrls.push(url)
        }
    }

    if (successUrls.length > 0) {
        loggerDlsite.log(`获取${successUrls.length}张剧照成功`)
    }

    if (failedUrls.length > 0) {
        loggerDlsite.warn(`获取${failedUrls.length}张剧照失败`, failedUrls)
    }

    return extrafanart
}
