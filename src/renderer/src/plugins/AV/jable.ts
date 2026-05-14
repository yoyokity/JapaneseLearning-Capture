import type { IAvContext } from '@renderer/plugins/AV/type'

import { EncodeHelper, NetHelper } from '@renderer/helper'
import { loggerJable } from '@renderer/plugins/AV/type'
import { load as cheerioLoad } from 'cheerio'

export async function getWebContentJable(
    searchTitle: string,
    context: IAvContext,
    signal: AbortSignal
): Promise<void> {
    // 先使用编号搜索
    if (context.num.jable) {
        const url = `https://www.jable.com/videos/${context.num.jable}`
        const res = await NetHelper.get(url, {
            signal
        })
        if (signal.aborted) return
        if (res.ok) {
            context.webContent.jable = res.body
            loggerJable.success(`获取到网页内容`)
            return
        }

        loggerJable.log(`使用编号搜索失败，使用原标题搜索`, url)
    }

    // 如果编号搜索失败，则使用原标题搜索
    const url = `https://jable.tv/search/${EncodeHelper.encodeUrl(searchTitle)}/`
    const res = await NetHelper.get(url, {
        signal
    })
    if (!res.ok) {
        loggerJable.warn(`获取网页内容失败`)
        return
    }

    const $ = cheerioLoad(res.body)
    const videoList = $('.video-img-box .title a')
        .toArray()
        .map((el) => {
            const item = $(el)
            return {
                href: item.attr('href')?.trim(),
                title: item.text().trim()
            }
        })
        .filter((item): item is { href: string; title: string } => !!item.href && !!item.title)

    loggerJable.log(
        `搜索到${videoList.length}个视频作为候选项：`,
        url,
        videoList.map((item) => item.title)
    )

    const match = EncodeHelper.bestMatch(
        searchTitle,
        videoList.map((item) => item.title)
    )
    if (!match) {
        loggerJable.warn(`未找到匹配的视频`)
        return
    }

    const targetVideo = videoList[match.index]
    loggerJable.log(`选择第 ${match.index + 1} 个视频: 【${targetVideo.title}】`, targetVideo.href)

    // 获取目标视频的webContent
    const webContent = await NetHelper.get(targetVideo.href, { signal })
    if (!webContent.ok) {
        loggerJable.warn(`获取网页内容失败`)
        return
    }

    // 记录
    context.num.jable = targetVideo.href.split(/[/\\]/).filter(Boolean).at(-1) || ''
    context.webContent.jable = webContent.body

    loggerJable.success(`获取到网页内容`)
}
