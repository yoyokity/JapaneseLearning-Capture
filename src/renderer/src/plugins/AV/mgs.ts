import type { IAvContext } from '@renderer/plugins/AV/type'

import { EncodeHelper, NetHelper } from '@renderer/helper'
import { loggerMsg } from '@renderer/plugins/AV/type'
import { load as cheerioLoad } from 'cheerio'

NetHelper.setCookie({
    url: 'https://www.mgstage.com/',
    domain: 'mgstage.com',
    value: {
        adc: '1'
    }
})

export async function getWebContentMgs(
    searchTitle: string,
    context: IAvContext,
    signal: AbortSignal
) {
    // 先使用编号搜索
    if (context.num.mgs) {
        const url = `https://www.mgstage.com/product/product_detail/${context.num.mgs}/`
        const res = await NetHelper.get(url, {
            signal
        })
        if (signal.aborted) return
        if (res.ok) {
            context.webContent.mgs = res.body
            loggerMsg.success(`获取到网页内容`)
            return
        }

        loggerMsg.log(`使用编号搜索失败，使用原标题搜索`, url)
    }

    // 如果编号搜索失败，则使用原标题搜索
    const url = `https://www.mgstage.com/search/cSearch.php?search_word=${EncodeHelper.encodeUrl(searchTitle.split(/\s+/)[0])}&x=17&y=12&search_shop_id=&type=top`
    const res = await NetHelper.get(url, {
        signal
    })
    if (!res.ok) {
        loggerMsg.warn(`获取网页内容失败`)
        return
    }

    const $ = cheerioLoad(res.body)
    const videoList = $('ul.product_list li')
        .toArray()
        .map((el) => {
            const item = $(el).find('.product_info a').first()
            const href = item.attr('href')
            const title = item.text().trim()

            return {
                href: href ? NetHelper.joinUrl('https://www.mgstage.com/', href) : '',
                title
            }
        })
        .filter((item): item is { href: string; title: string } => !!item.href && !!item.title)

    loggerMsg.log(
        `搜索到${videoList.length}个视频作为候选项：`,
        url,
        videoList.map((item) => item.title)
    )

    // 找到最匹配的视频
    const match = EncodeHelper.bestMatch(
        searchTitle,
        videoList.map((item) => item.title)
    )
    if (!match) {
        loggerMsg.warn(`未找到匹配的视频`)
        return
    }

    const targetVideo = videoList[match.index]

    loggerMsg.log(`选择第 ${match.index + 1} 个视频: 【${targetVideo.title}】`, targetVideo.href)

    // 获取目标视频的webContent
    const webContent = await NetHelper.get(targetVideo.href, { signal })
    if (!webContent.ok) {
        loggerMsg.warn(`获取网页内容失败`)
        return
    }

    // 记录
    context.num.mgs = targetVideo.href.split(/[/\\]/).filter(Boolean).at(-1) || ''
    context.webContent.mgs = webContent.body

    loggerMsg.success(`获取到网页内容`)
}
