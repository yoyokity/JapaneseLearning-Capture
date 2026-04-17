import type { IResultWithError } from '@renderer/helper'
import type { IScraper, IVideo, IVideoFile } from '@renderer/scraper'
import type { Ref } from 'vue'

import { LogHelper, PathHelper, TaskHelper } from '@renderer/helper'
import { Scraper } from '@renderer/scraper'
import { settingsStore } from '@renderer/stores'
import { toRaw } from 'vue'

type TScraperFuncName = keyof IScraper['scraperVideoFuncs']
type TScraperParseFunc = (video: IVideo, webContent: string) => Promise<IVideo | null>

interface IScraperContext {
    logger: ReturnType<typeof LogHelper.title>
    scraper: NonNullable<ReturnType<typeof Scraper.getScraperInstance>>
}

/**
 * 获取刮削上下文
 * @param video 视频对象
 * @param toast 提示组件
 */
function getScraperContext(video: IVideo, toast: any): IScraperContext | null {
    const scraper = Scraper.getScraperInstance(video.scraperName)
    if (!scraper) {
        toast.error(`未找到对应的刮削器！`)
        return null
    }

    const log = LogHelper.title(video.scraperName)
    return { scraper, logger: log }
}

/**
 * 确保网页内容已获取
 * @param context 刮削上下文
 * @param video 视频对象
 * @param webContent 网页内容
 * @param toast 提示组件
 */
async function ensureWebContent(
    context: IScraperContext,
    video: IVideo,
    webContent: Ref<string>,
    toast: any
) {
    if (webContent.value) {
        return true
    }

    try {
        context.logger.log(`获取网页内容中...`)
        const re = await context.scraper.scraperVideoFuncs.getWebContent(video)
        if (!re) {
            context.logger.error(`获取网页内容失败！`)
            toast.error(`获取网页内容失败！`)
            return false
        }

        webContent.value = re
        return true
    } catch (error) {
        context.logger.error(`获取网页内容出错！`, error)
        return false
    }
}

/**
 * 执行单个字段解析
 * @param context 刮削上下文
 * @param video 视频对象
 * @param webContent 网页内容
 * @param funcName 解析函数名称
 * @param label 字段名称
 */
async function parseField(
    context: IScraperContext,
    video: IVideo,
    webContent: string,
    funcName: TScraperFuncName,
    label: string
) {
    try {
        context.logger.log(`解析${label}...`)
        const func = context.scraper.scraperVideoFuncs[funcName] as TScraperParseFunc
        const re = await func(video, webContent)
        return Boolean(re)
    } catch (error) {
        context.logger.error(`解析${label}出错！`, error)
        return false
    }
}

/**
 * 通用刮削函数，刮削单个字段
 * @param video 视频对象
 * @param webContent 网页内容
 * @param toast 提示组件
 * @param funcName 刮削函数名称
 * @param logName 日志显示名称
 */
export function scraperField(
    video: IVideo,
    webContent: Ref<string>,
    toast: any,
    funcName: TScraperFuncName,
    logName: string
) {
    const context = getScraperContext(video, toast)
    if (!context) {
        return
    }

    context.logger.separator()
    context.logger.log(`开始刮削：`, toRaw(video))

    TaskHelper.queueWithInterval('scraper', 0, true, async () => {
        const hasWebContent = await ensureWebContent(context, video, webContent, toast)
        if (!hasWebContent) {
            return
        }

        const success = await parseField(context, video, webContent.value, funcName, logName)
        if (!success) {
            context.logger.warn(`${logName}解析出错！`)
            toast.warn(`${logName}解析出错！`)
        } else {
            context.logger.success(`${logName}解析成功！`)
            toast.success(`${logName}获取成功！`)
        }

        //更新编号
        const parseNum = context.scraper.scraperVideoFuncs.parseNum as TScraperParseFunc
        const re2 = await parseNum(video, webContent.value)
        if (!re2) {
            context.logger.warn(`更新编号出错！`)
            toast.warn(`更新编号出错！`)
        }

        if (success) {
            context.logger.success(`刮削结束：`, toRaw(video))
        } else {
            context.logger.warn(`刮削结束：`, toRaw(video))
        }
    })
}

/** 需要执行的解析函数列表 */
const PARSE_FUNCS: { name: TScraperFuncName; label: string }[] = [
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
    const context = getScraperContext(video, toast)
    if (!context) {
        return
    }

    context.logger.separator()
    context.logger.log(`开始刮削：`, toRaw(video))

    const hasWebContent = await TaskHelper.queueWithInterval('scraper', 0, true, async () =>
        ensureWebContent(context, video, webContent, toast)
    )
    if (!hasWebContent || !webContent.value) {
        return
    }

    //执行所有解析函数
    const failed: string[] = []
    for (const { name, label } of PARSE_FUNCS) {
        await TaskHelper.queueWithInterval('scraper', 0, true, async () => {
            const success = await parseField(context, video, webContent.value, name, label)
            if (!success) {
                failed.push(label)
            }
        })
    }

    if (failed.length > 0) {
        context.logger.warn(`以下字段解析失败：${failed.join('、')}`)
        toast.warn(`以下字段解析失败：${failed.join('、')}`)
    } else {
        context.logger.success('全部解析成功！')
        toast.success('全部信息获取成功！')
    }

    context.logger.success(`刮削结束：`, toRaw(video))
}

export async function scraperSave(
    video: IVideo,
    sourceVideoFile: IVideoFile,
    webContent: Ref<string>
): Promise<IResultWithError<boolean>> {
    const scraper = Scraper.getScraperInstance(video.scraperName)
    if (!scraper) {
        return { error: '未找到对应的刮削器！', hasError: true }
    }

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
    if (videoDir.hasError) {
        return { error: videoDir.error, hasError: true }
    }

    return {
        result: true,
        hasError: false
    }
}
