import type { IResultWithError } from '@renderer/helper'
import type { IScraper, IVideo, IVideoFile } from '@renderer/scraper'
import type { IScraperContext, ScraperFuncName } from '@renderer/scraper/hooks/type'

import { useMessage } from '@renderer/components/control/message'
import { LogHelper, PathHelper, TaskHelper } from '@renderer/helper'
import { Scraper } from '@renderer/scraper'
import { parseFuncs } from '@renderer/scraper/hooks/type'
import { settingsStore } from '@renderer/stores'
import { toRaw } from 'vue'

/**
 * 管理编辑界面的刮削Hook
 */
export function useEditeScraper() {
    const { toast } = useMessage()
    const contentCache = new Map<string, unknown>()

    /**
     * 获取内容缓存键
     * @param video 视频对象
     */
    function getContentCacheKey(video: IVideo) {
        const originaltitle = video.originaltitle?.trim() || ''
        return [video.scraperName, originaltitle].join('__')
    }

    /**
     * 获取刮削上下文
     * @param video 视频对象
     */
    function getScraperContext(video: IVideo): IScraperContext | null {
        const scraper = Scraper.getScraperInstance(video.scraperName)
        if (!scraper) {
            toast.error(`未找到对应的刮削器！`)
            return null
        }

        const log = LogHelper.title(video.scraperName)
        return { scraper, logger: log }
    }

    /**
     * 获取内容缓存
     * @param scraper 刮削器
     * @param video 视频对象
     */
    function getContent<TContent>(scraper: IScraper<TContent>, video: IVideo): TContent {
        const cacheKey = getContentCacheKey(video)
        const cachedContent = contentCache.get(cacheKey)
        if (cachedContent) {
            return cachedContent as TContent
        }

        const content = scraper.createContext()
        contentCache.set(cacheKey, content)
        return content
    }

    /**
     * 确保内容已获取
     * @param context 刮削上下文
     * @param video 视频对象
     */
    async function ensureContent(context: IScraperContext, video: IVideo) {
        try {
            const content = getContent(context.scraper, video)
            context.logger.log(`获取网页内容中...`)
            if (!(await context.scraper.scraperVideoFuncs.getWebContext(video, content))) {
                context.logger.error(`获取网页内容失败！`)
                toast.error(`获取网页内容失败！`)
                return false
            }

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
     * @param funcName 解析函数名称
     * @param label 字段名称
     */
    async function parseField(
        context: IScraperContext,
        video: IVideo,
        funcName: ScraperFuncName,
        label: string
    ) {
        try {
            context.logger.log(`解析${label}...`)
            const content = getContent(context.scraper, video)
            const func = context.scraper.scraperVideoFuncs[funcName] as (
                video: IVideo,
                content: unknown
            ) => Promise<boolean>
            return await func(video, content)
        } catch (error) {
            context.logger.error(`解析${label}出错！`, error)
            return false
        }
    }

    /**
     * 通用刮削函数，刮削单个字段
     * @param video 视频对象
     * @param funcName 刮削函数名称
     * @param logName 日志显示名称
     */
    function scraperField(video: IVideo, funcName: ScraperFuncName, logName: string) {
        const context = getScraperContext(video)
        if (!context) {
            return
        }

        context.logger.separator()
        context.logger.log(`开始刮削：`, toRaw(video))

        TaskHelper.queueWithCancel({ taskName: 'scraper' }, async () => {
            // 先确保有网页内容
            if (!(await ensureContent(context, video))) {
                return
            }

            // 执行解析
            const success = await parseField(context, video, funcName, logName)
            if (!success) {
                context.logger.warn(`${logName}解析出错！`)
                toast.warn(`${logName}解析出错！`)
            } else {
                context.logger.success(`${logName}解析成功！`)
                toast.success(`${logName}获取成功！`)
            }

            // 更新编号
            let numSuccess = false
            let numHasError = false

            try {
                const content = getContent(context.scraper, video)
                numSuccess =
                    (await context.scraper.scraperVideoFuncs.parseNum(video, content)) ?? false
            } catch (error) {
                numHasError = true
                context.logger.error(`更新编号出错！`, error)
            }

            if (numSuccess) {
                context.logger.success(`更新编号成功！`)
            } else if (!numHasError) {
                context.logger.warn(`更新编号出错！`)
                toast.warn(`更新编号出错！`)
            }

            // 结束
            if (success) {
                context.logger.success(`刮削结束：`, toRaw(video))
            } else {
                context.logger.warn(`刮削结束：`, toRaw(video))
            }
        })
    }

    /**
     * 刮削全部信息
     * @param video 视频对象
     */
    async function scraperAll(video: IVideo) {
        const context = getScraperContext(video)
        if (!context) {
            return
        }

        context.logger.separator()
        context.logger.log(`开始刮削：`, toRaw(video))

        // 先确保有网页内容
        const hasContent = await TaskHelper.queueWithCancel({ taskName: 'scraper' }, async () =>
            ensureContent(context, video)
        )
        if (!hasContent) {
            return
        }

        const failed: string[] = []
        for (const { name, label } of parseFuncs) {
            await TaskHelper.queueWithCancel({ taskName: 'scraper' }, async () => {
                if (!(await parseField(context, video, name, label))) {
                    failed.push(label)
                }
            })
        }

        if (failed.length > 0) {
            context.logger.warn(`以下字段解析失败：${failed.join('、')}`)
            toast.warn(`以下字段解析失败：${failed.join('、')}`)
        } else if (failed.length === parseFuncs.length) {
            context.logger.warn('全部解析失败！')
            toast.warn('全部信息获取失败！')
        } else {
            context.logger.success('全部解析成功！')
            toast.success('全部信息获取成功！')
        }

        context.logger.success(`刮削结束：`, toRaw(video))
    }

    /**
     * 保存刮削结果
     * @param video 视频对象
     * @param sourceVideoFile 原始视频文件
     */
    async function scraperSave(
        video: IVideo,
        sourceVideoFile: IVideoFile
    ): Promise<IResultWithError<boolean>> {
        const scraper = Scraper.getScraperInstance(video.scraperName)
        if (!scraper) {
            return { error: '未找到对应的刮削器！', hasError: true }
        }

        const settings = settingsStore()
        const content = getContent(scraper, video)

        const { dir, fileName } = await scraper.scraperVideoFuncs.parseOutput(video, content)
        const scraperPath = settings.scraperPath[video.scraperName]

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

    return {
        /**
         * 通用刮削函数，刮削单个字段
         * @param video 视频对象
         * @param funcName 刮削函数名称
         * @param logName 日志显示名称
         */
        scraperField,
        /**
         * 刮削全部信息
         * @param video 视频对象
         */
        scraperAll,
        /**
         * 保存刮削结果
         * @param video 视频对象
         * @param sourceVideoFile 原始视频文件
         */
        scraperSave
    }
}
