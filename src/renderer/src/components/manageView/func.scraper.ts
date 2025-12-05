import type { IScraper, IVideo } from '@renderer/scraper'
import type { Ref } from 'vue'

import { DebugHelper } from '@renderer/helper'
import { Scraper } from '@renderer/scraper'

function warn(text: string, toast: any) {
    toast.warn(text)
    DebugHelper.warn(text)
}

/**
 * 通用刮削函数
 * @param video 视频对象
 * @param webContent 网页内容
 * @param toast 提示组件
 * @param funcName 刮削函数名称
 * @param logName 日志显示名称
 */
export async function scraperField(
    video: IVideo,
    webContent: Ref<string>,
    toast: any,
    funcName: keyof IScraper['scraperVideoFuncs'],
    logName: string
) {
    const scraper = Scraper.getScraperInstance(video.scraperName)
    if (!scraper) {
        toast.error(`未找到对应的刮削器！`)
        return
    }

    //如果webContent为空，则获取网页内容
    if (!webContent.value) {
        DebugHelper.log('[刮削] 获取网页内容...')
        const re = await scraper.scraperVideoFuncs.getWebContent(video)
        if (!re) {
            warn(`获取网页内容失败！`, toast)
            return
        }
        webContent.value = re
    }

    //开始解析
    DebugHelper.log(`[刮削] 解析${logName}...`)
    const func = scraper.scraperVideoFuncs[funcName] as (
        video: IVideo,
        webContent: string
    ) => Promise<IVideo | null>
    const re = await func(video, webContent.value)
    if (!re) {
        warn(`${logName}解析出错！`, toast)
    } else {
        DebugHelper.info(`[刮削] 解析${logName}成功！`)
        toast.success(`${logName}获取成功！`)
    }

    //更新编号
    const re2 = await scraper.scraperVideoFuncs.parseNum(video, webContent.value)
    if (!re2) {
        DebugHelper.warn(`更新编号出错！`, toast)
    }
}
