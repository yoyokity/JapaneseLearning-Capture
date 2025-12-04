import type { IVideo } from '@renderer/scraper'
import type { Ref } from 'vue'

import { DebugHelper } from '@renderer/helper'
import { Scraper } from '@renderer/scraper'

function warn(text: string, toast: any) {
    toast.warn(text)
    DebugHelper.warn(text)
}

export async function scraperTitle(video: IVideo, webContent: Ref<string>, toast: any) {
    const scraper = Scraper.getScraperInstance(video.scraperName)
    if (!scraper) {
        toast.error(`未找到对应的刮削器！`)
        return
    }

    if (!webContent.value) {
        DebugHelper.log('[刮削] 获取网页内容...')
        const re = await scraper?.scraperVideoFuncs.getWebContent(video)
        if (!re) {
            warn(`获取网页内容失败！`, toast)
            return
        }
        webContent.value = re
    }

    DebugHelper.log('[刮削] 解析标题...')
    const re = await scraper?.scraperVideoFuncs.parseTitle(video, webContent.value)
    if (!re) warn(`标题解析出错！`, toast)
}
