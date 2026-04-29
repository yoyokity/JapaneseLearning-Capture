import type { IHanimeContext } from '@renderer/plugins/Hanime/temp'

import { EncodeHelper, ImageHelper, NetHelper } from '@renderer/helper'
import { loggerFanza } from '@renderer/plugins/Hanime/temp'
import { load as cheerioLoad } from 'cheerio'

export const fanzaOptions = {
    headers: {
        referer: 'https://www.dmm.co.jp/'
    },
    cookie: { age_check_done: '1', ckcy: '1' }
}

async function get(url: string, signal: AbortSignal) {
    const webContent = await NetHelper.get(url, { ...fanzaOptions, signal })
    if (!webContent.ok || signal.aborted) return webContent

    if (webContent.body.includes('18歳未満')) {
        // 开始绕过验证
        const $ = cheerioLoad(webContent.body)
        const url = $('.turtle-component').find('a').attr('href')!
        return await NetHelper.get(url, { signal })
    }

    // 成功
    return webContent
}

export async function getWebContentFanza(
    searchTitle: string,
    context: IHanimeContext,
    signal: AbortSignal
): Promise<void> {
    loggerFanza.log(`开始获取网页内容`)

    // 先使用编号搜索
    if (context.num.fanza) {
        const url = `https://www.dmm.co.jp/mono/anime/-/detail/=/cid=${context.num.fanza}/`

        loggerFanza.log(`使用编号搜索：${context.num.fanza}`)
        const webContent = await get(url, signal)
        if (signal.aborted) return
        if (webContent.ok) {
            context.webContent.fanza = webContent.body
            loggerFanza.success(`获取到网页内容`)
            return
        }

        loggerFanza.log(`使用编号搜索失败，使用原标题搜索`, url)
    }

    // 如果编号搜索失败，则使用原标题搜索
    const searchUrl = `https://www.dmm.co.jp/mono/anime/-/search/=/searchstr=${EncodeHelper.encodeUrl(searchTitle)}/`
    const webContent = await get(searchUrl, signal)
    if (signal.aborted) return
    if (!webContent.ok) {
        loggerFanza.warn(`获取搜索结果失败`, searchUrl)
        return
    }

    // 在视频列表中找到匹配度最高的
    const $ = cheerioLoad(webContent.body)
    const videoList = $('ul#list p.tmb > a')
    const candidates = videoList.toArray().map((el) => ({
        title: $(el).find('span.txt').text().trim(),
        href: $(el).attr('href')?.trim()
    }))

    loggerFanza.log(`搜索到${candidates.length}个番剧作为候选项：`, searchUrl)
    candidates.forEach((item) => loggerFanza.log(`【${item.title}】`))

    const matchedTitle = EncodeHelper.bestMatch(
        searchTitle,
        candidates.map((item) => item.title)
    )
    if (!matchedTitle) {
        loggerFanza.warn(`没有找到匹配的番剧`)
        return
    }

    const href = candidates.find((item) => item.title === matchedTitle)!.href!
    loggerFanza.log(`找到匹配的番剧：【${matchedTitle}】 ${href}`)

    // 根据href获取webContent
    const detailContent = await NetHelper.get(href, { ...fanzaOptions, signal })
    if (signal.aborted) return
    if (!detailContent.ok) {
        loggerFanza.warn(`获取网页内容失败`, href)
        return
    }

    // 记录num
    context.num.fanza = href.match(/\/cid=(?<id>[^/]+)\//)?.groups?.id || ''
    context.webContent.fanza = detailContent.body

    loggerFanza.success(`获取到网页内容`)
}

/**
 * 获取 Fanza 封面
 */
export async function getPosterFanza(
    context: IHanimeContext,
    signal: AbortSignal
): Promise<string | null> {
    if (!context.webContent.fanza) {
        return null
    }

    const $ = cheerioLoad(context.webContent.fanza)
    const posterUrl = $('meta[property="og:image"]').attr('content')?.trim()

    if (!posterUrl) {
        return null
    }

    const re = await NetHelper.getImage(posterUrl, { ...fanzaOptions, signal })
    if (signal.aborted) return null
    if (!re.ok) {
        loggerFanza.warn(`获取封面失败！:${posterUrl}`)
        return null
    }

    loggerFanza.log(`获取封面成功！:${posterUrl}`)
    return ImageHelper.saveTempImage(re.body, `fanza_poster`)
}

/**
 * 获取 Fanza 剧照
 */
export async function getExtrafanartFanza(
    context: IHanimeContext,
    signal: AbortSignal
): Promise<string[]> {
    if (!context.webContent.fanza) {
        loggerFanza.log(`- 没有fanza，无法获取剧照`)
        return []
    }

    const $ = cheerioLoad(context.webContent.fanza)
    const hrefs = $('ul#sample-image-block')
        .find('li')
        .filter((_, el) => $(el).find('a').attr('id')?.startsWith('sample') === true)
        .map((_, el) =>
            $(el)
                .find('img')
                .attr('data-lazy')
                // 转为大图
                ?.replace(
                    /(?<prefix>\/digital\/video\/[^/]+\/[^/]+)-(?<index>\d+)\.jpg$/,
                    '$<prefix>jp-$<index>.jpg'
                )
        )
        .toArray()

    const extrafanart: string[] = []
    const successUrls: string[] = []
    const failedUrls: string[] = []
    for (const url of hrefs) {
        const re = await NetHelper.getImage(url, { ...fanzaOptions, signal })
        if (signal.aborted) break
        if (re.ok) {
            successUrls.push(url)
            const tempPath = await ImageHelper.saveTempImage(re.body, `fanza_extrafanart`)
            if (tempPath) extrafanart.push(tempPath)
        } else {
            failedUrls.push(url)
        }
    }

    if (successUrls.length > 0) {
        loggerFanza.log(`获取${successUrls.length}张剧照成功`)
    }

    if (failedUrls.length > 0) {
        loggerFanza.warn(`获取${failedUrls.length}张剧照失败`, failedUrls)
    }

    return extrafanart
}
