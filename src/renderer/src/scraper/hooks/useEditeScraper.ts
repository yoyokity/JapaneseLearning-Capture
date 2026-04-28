import type { IResultWithError } from '@renderer/helper'
import type { IScraper, IVideo, IVideoFile } from '@renderer/scraper'
import type { IScraperContext, ScraperFuncName } from '@renderer/scraper/hooks/type'

import { useMessage } from '@renderer/components/control/message'
import { LogHelper, PathHelper } from '@renderer/helper'
import { Scraper } from '@renderer/scraper'
import { parseFuncs } from '@renderer/scraper/hooks/type'
import { globalStatesStore, settingsStore } from '@renderer/stores'
import { computed, ref, toRaw } from 'vue'

/**
 * 管理编辑界面的刮削Hook
 */
export function useEditeScraper() {
    const { toast } = useMessage()
    const contentCache = new Map<string, unknown>()
    const globalStates = globalStatesStore()
    const scraperFieldRunning = ref(false)
    const scraperAllRunning = ref(false)
    const isEditeScraperRunning = computed(
        () => scraperFieldRunning.value || scraperAllRunning.value
    )
    const isScraperRunning = computed(
        () => globalStates.batchRunning || scraperFieldRunning.value || scraperAllRunning.value
    )

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
    async function ensureContent(context: IScraperContext, video: IVideo, signal: AbortSignal) {
        try {
            const content = getContent(context.scraper, video)
            context.logger.log(`获取网页内容中...`)
            if (!(await context.scraper.scraperVideoFuncs.getWebContext(video, content, signal))) {
                context.logger.warn(`获取网页内容失败！`)
                toast.warn(`获取网页内容失败！`)
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
        label: string,
        signal: AbortSignal
    ) {
        try {
            context.logger.log(`解析${label}...`)
            const content = getContent(context.scraper, video)
            const func = context.scraper.scraperVideoFuncs[funcName] as (
                video: IVideo,
                content: unknown,
                signal: AbortSignal
            ) => Promise<boolean>
            return await func(video, content, signal)
        } catch (error) {
            context.logger.error(`解析${label}出错！`, error)
            return false
        }
    }

    /**
     * 获取取消结果
     * @param signal 取消信号
     * @param onProgress 进度回调
     */
    function getAbortResult(signal: AbortSignal, onProgress: (progress: number) => void) {
        if (!signal.aborted) {
            return false
        }

        onProgress(100)
        toast.warn('刮削已取消！')
        LogHelper.warn('刮削已取消！')
        return true
    }

    /**
     * 通用刮削函数，刮削单个字段
     * @param video 视频对象
     * @param funcName 刮削函数名称
     */
    async function scraperField(
        video: IVideo,
        funcName: ScraperFuncName,
        signal: AbortSignal,
        onProgress: (progress: number) => void
    ) {
        const scraperContext = getScraperContext(video)
        if (!scraperContext) {
            return
        }

        const funcConfig = parseFuncs.find((item) => item.name === funcName)
        const logName = funcConfig?.label || funcName

        scraperContext.logger.separator()
        scraperContext.logger.log(`开始刮削：`, toRaw(video))
        scraperFieldRunning.value = true

        try {
            onProgress(5)
            if (getAbortResult(signal, onProgress)) return

            // 先确保有网页内容
            if (!(await ensureContent(scraperContext, video, signal))) {
                onProgress(100)
                return
            }

            if (getAbortResult(signal, onProgress)) return

            onProgress(60)

            // 执行解析
            const success = await parseField(scraperContext, video, funcName, logName, signal)
            if (getAbortResult(signal, onProgress)) return

            if (!success) {
                scraperContext.logger.warn(`${logName}解析出错！`)
                toast.warn(`${logName}解析出错！`)
            } else {
                scraperContext.logger.success(`${logName}解析成功！`)
                toast.success(`${logName}获取成功！`)
            }

            onProgress(80)

            // 更新编号
            let numSuccess = false
            let numHasError = false

            try {
                const content = getContent(scraperContext.scraper, video)
                numSuccess =
                    (await scraperContext.scraper.scraperVideoFuncs.parseNum(
                        video,
                        content,
                        signal
                    )) ?? false
            } catch (error) {
                numHasError = true
                scraperContext.logger.error(`更新编号出错！`, error)
            }

            if (getAbortResult(signal, onProgress)) return

            if (numSuccess) {
                scraperContext.logger.success(`更新编号成功！`)
            } else if (!numHasError) {
                scraperContext.logger.warn(`更新编号出错！`)
                toast.warn(`更新编号出错！`)
            }

            onProgress(100)

            // 结束
            if (success) {
                scraperContext.logger.success(`刮削结束：`, toRaw(video))
            } else {
                scraperContext.logger.warn(`刮削结束：`, toRaw(video))
            }
        } finally {
            scraperFieldRunning.value = false
        }
    }

    /**
     * 刮削全部信息
     * @param video 视频对象
     */
    async function scraperAll(
        video: IVideo,
        signal: AbortSignal,
        onProgress: (progress: number) => void
    ) {
        const scraperContext = getScraperContext(video)
        if (!scraperContext) {
            return
        }

        scraperContext.logger.separator()
        scraperContext.logger.log(`开始刮削：`, toRaw(video))
        scraperAllRunning.value = true

        try {
            onProgress(5)
            if (getAbortResult(signal, onProgress)) return

            // 先确保有网页内容
            if (!(await ensureContent(scraperContext, video, signal))) {
                onProgress(100)
                return
            }

            if (getAbortResult(signal, onProgress)) return

            onProgress(10)

            const failed: string[] = []
            for (const [index, { name, label }] of parseFuncs.entries()) {
                if (getAbortResult(signal, onProgress)) return

                if (!(await parseField(scraperContext, video, name, label, signal))) {
                    failed.push(label)
                }

                if (getAbortResult(signal, onProgress)) return

                onProgress(10 + ((index + 1) * 90) / parseFuncs.length)
            }

            if (failed.length === parseFuncs.length) {
                scraperContext.logger.warn('全部解析失败！')
                toast.warn('全部信息获取失败！')
            } else if (failed.length > 0) {
                scraperContext.logger.warn(`以下字段解析失败：${failed.join('、')}`)
                toast.warn(`以下字段解析失败：${failed.join('、')}`)
            } else {
                scraperContext.logger.success('全部解析成功！')
                toast.success('全部信息获取成功！')
            }

            scraperContext.logger.success(`刮削结束：`, toRaw(video))
        } finally {
            scraperAllRunning.value = false
        }
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
         * @param signal 取消信号
         * @param onProgress 进度回调
         */
        scraperField,
        /**
         * 刮削全部信息
         * @param video 视频对象
         * @param signal 取消信号
         * @param onProgress 进度回调
         */
        scraperAll,
        /**
         * 保存刮削结果
         * @param video 视频对象
         * @param sourceVideoFile 原始视频文件
         */
        scraperSave,
        /**
         * 是否全部刮削器都在运行中
         */
        isScraperRunning,
        /**
         * 编辑器的刮削器是不是都在运行中
         */
        isEditeScraperRunning
    }
}
