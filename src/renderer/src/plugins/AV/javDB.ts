import type { IAvContext } from '@renderer/plugins/AV/type'

import { EncodeHelper, NetHelper } from '@renderer/helper'
import { loggerJavDB } from '@renderer/plugins/AV/type'
import { load as cheerioLoad } from 'cheerio'
import dayjs from 'dayjs'

NetHelper.setCookie({
    url: 'https://javdb.com/',
    domain: 'javdb.com',
    value: {
        over18: '1',
        locale: 'zh'
    }
})

export async function getWebContentJavDB(
    searchTitle: string,
    context: IAvContext,
    signal: AbortSignal
): Promise<void> {
    // 先使用编号搜索
    if (context.num.JavDB) {
        const url = `https://javdb.com/v/${context.num.JavDB}`
        const res = await NetHelper.get(url, {
            signal
        })
        if (signal.aborted) return
        if (res.ok) {
            context.webContent.JavDB = res.body
            loggerJavDB.success(`获取到网页内容`)
            return
        }

        loggerJavDB.log(`使用编号搜索失败，使用原标题搜索`, url)
    }

    // 如果编号搜索失败，则使用原标题搜索
    const url = `https://javdb.com/search?q=${EncodeHelper.encodeUrl(searchTitle)}&f=all`
    const res = await NetHelper.get(url, {
        signal
    })
    if (!res.ok) {
        loggerJavDB.warn(`获取网页内容失败`)
        return
    }

    const $ = cheerioLoad(res.body)
    const videoListRaw = $('.movie-list .item')
        .toArray()
        .map((el) => {
            const item = $(el)
            const href = item.find('a.box').attr('href')?.trim()
            const title = item.find('.video-title strong').text().trim()
            const time = item.find('.meta').text().trim()

            return {
                href: href ? NetHelper.joinUrl('https://javdb.com/', href) : '',
                title,
                time: dayjs(time)
            }
        })
        .filter(
            (item): item is { href: string; title: string; time: dayjs.Dayjs } =>
                !!item.href && !!item.title
        )

    const videoMap = new Map<string, (typeof videoListRaw)[number]>()

    // 同名标题只保留时间最近的一个
    for (const item of videoListRaw) {
        const oldItem = videoMap.get(item.title)
        if (!oldItem) {
            videoMap.set(item.title, item)
            continue
        }

        const oldTime = oldItem.time.isValid() ? oldItem.time.valueOf() : 0
        const newTime = item.time.isValid() ? item.time.valueOf() : 0
        if (newTime > oldTime) {
            videoMap.set(item.title, item)
        }
    }

    const videoList = Array.from(videoMap.values()).sort(
        (a, b) => b.time.valueOf() - a.time.valueOf()
    )

    loggerJavDB.log(
        `搜索到${videoList.length}个视频作为候选项：`,
        url,
        videoList.map((item) => item.title)
    )

    // 选择最佳匹配的视频
    const match = EncodeHelper.bestMatch(
        searchTitle,
        videoList.map((item) => item.title)
    )
    if (!match) {
        loggerJavDB.warn(`未找到匹配的视频`)
        return
    }

    const targetVideo = videoList[match.index]
    loggerJavDB.log(`选择第 ${match.index + 1} 个视频:【 ${targetVideo.title}】`, targetVideo.href)

    // 获取目标视频的webContent
    const webContent = await NetHelper.get(targetVideo.href, { signal })
    if (!webContent.ok) {
        loggerJavDB.warn(`获取网页内容失败`)
        return
    }

    // 记录
    context.num.JavDB = targetVideo.href.split(/[/\\]/).filter(Boolean).at(-1) || ''
    context.webContent.JavDB = webContent.body

    loggerJavDB.success(`获取到网页内容`)
}
