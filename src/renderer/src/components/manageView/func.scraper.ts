import type { IScraper, IVideo, IVideoFile } from '@renderer/scraper'
import type { Ref } from 'vue'

import { DebugHelper, PathHelper } from '@renderer/helper'
import { Scraper } from '@renderer/scraper'
import { settingsStore } from '@renderer/stores'
import { toRaw } from 'vue'

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

/** 需要执行的解析函数列表 */
const PARSE_FUNCS: { name: keyof IScraper['scraperVideoFuncs']; label: string }[] = [
    { name: 'parseTitle', label: '标题' },
    { name: 'parseOriginaltitle', label: '原标题' },
    { name: 'parseSorttitle', label: '排序标题' },
    { name: 'parseTagline', label: '宣传词' },
    { name: 'parseNum', label: '编号' },
    { name: 'parseMpaa', label: '分级' },
    { name: 'parseRating', label: '评分' },
    { name: 'parseDirector', label: '导演' },
    { name: 'parseActor', label: '演员' },
    { name: 'parseStudio', label: '发行商' },
    { name: 'parseMaker', label: '制片商' },
    { name: 'parseSet', label: '影片系列' },
    { name: 'parseTag', label: '标签' },
    { name: 'parseGenre', label: '类型' },
    { name: 'parsePlot', label: '简介' },
    { name: 'parseYear', label: '发行年份' },
    { name: 'parsePremiered', label: '首映日期' },
    { name: 'parseReleasedate', label: '上映日期' },
    { name: 'parsePoster', label: '封面' },
    { name: 'parseThumb', label: '缩略图' },
    { name: 'parseFanart', label: '背景图' },
    { name: 'parseExtrafanart', label: '额外背景图' }
]

/**
 * 刮削全部信息
 * @param video 视频对象
 * @param webContent 网页内容
 * @param toast 提示组件
 */
export async function scraperAll(video: IVideo, webContent: Ref<string>, toast: any) {
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

    //执行所有解析函数
    const failed: string[] = []
    for (const { name, label } of PARSE_FUNCS) {
        DebugHelper.log(`[刮削] 解析${label}...`)
        const func = scraper.scraperVideoFuncs[name] as (
            video: IVideo,
            webContent: string
        ) => Promise<IVideo | null>
        const re = await func(video, webContent.value)
        if (!re) {
            failed.push(label)
        }
    }

    if (failed.length > 0) {
        warn(`以下字段解析失败：${failed.join('、')}`, toast)
    } else {
        DebugHelper.info('[刮削] 全部解析成功！')
        toast.success('全部信息获取成功！')
    }
}

export async function scraperSave(
    video: IVideo,
    sourceVideoFile: IVideoFile,
    webContent: Ref<string>,
    toast: any
): Promise<boolean> {
    const scraper = Scraper.getScraperInstance(video.scraperName)
    if (!scraper) {
        toast.error(`未找到对应的刮削器！`)
        return false
    }

    console.log('sourceVideoFile: ', toRaw(sourceVideoFile))
    console.log('video:', toRaw(video))

    const settings = settingsStore()

    //解析输出目录
    const { dir, fileName } = await scraper.scraperVideoFuncs.parseOutput(video, webContent.value)
    const scraperPath = settings.scraperPath[video.scraperName]

    //创建目录
    const videoDir = await Scraper.createDirectory(
        PathHelper.newPath(scraperPath),
        video,
        sourceVideoFile,
        dir,
        fileName
    )
    if (!videoDir) {
        return false
    }

    //处理图片
    await scraper.downloadImage(videoDir, video)
    return true
}
