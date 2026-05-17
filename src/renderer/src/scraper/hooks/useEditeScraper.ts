import type { IResultWithError } from '@renderer/helper'
import type { IScraperVideoFuncs, IVideo, IVideoFile } from '@renderer/scraper'
import type { IScraperContext, ScraperFuncName } from '@renderer/scraper/hooks/type'

import { useMessage } from '@renderer/components/control/message'
import { LogHelper, PathHelper } from '@renderer/helper'
import { Scraper, videoObjFormat } from '@renderer/scraper'
import { parseFuncs } from '@renderer/scraper/hooks/type'
import { globalStatesStore, settingsStore } from '@renderer/stores'
import { computed, ref } from 'vue'

/**
 * 管理编辑界面的刮削Hook
 */
export function useEditeScraper() {
    const { toast } = useMessage()
    const globalStates = globalStatesStore()
    const scraperFieldRunning = ref(false)
    const scraperAllRunning = ref(false)
    const isEditeScraperRunning = computed(
        () => scraperFieldRunning.value || scraperAllRunning.value
    )
    const isScraperRunning = computed(
        () => globalStates.batchRunning || scraperFieldRunning.value || scraperAllRunning.value
    )

    let funcs: IScraperVideoFuncs | null = null

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
     * 确保内容已获取
     * @param scraperContext 刮削上下文
     */
    async function ensureContent(scraperContext: IScraperContext, funcs: IScraperVideoFuncs) {
        try {
            scraperContext.logger.log(`获取网页内容中...`)
            if (!(await funcs.getWebContext())) {
                scraperContext.logger.warn(`获取网页内容失败！`)
                toast.warn(`获取网页内容失败！`)
                return false
            }

            return true
        } catch (error) {
            scraperContext.logger.error(`获取网页内容出错！`, error)
            return false
        }
    }

    /**
     * 执行单个字段解析
     * @param scraperContext 刮削上下文
     * @param funcs 刮削器方法实例
     * @param funcName 解析函数名称
     * @param label 字段名称
     */
    async function parseField(
        scraperContext: IScraperContext,
        funcs: IScraperVideoFuncs,
        funcName: ScraperFuncName,
        label: string
    ) {
        try {
            scraperContext.logger.log(`解析${label}...`)
            return (await funcs[funcName]()) as boolean | null
        } catch (error) {
            scraperContext.logger.error(`解析${label}出错！`, error)
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

        // 创建新的刮削器方法实例
        if (!funcs) funcs = scraperContext.scraper.createScraperVideoFuncs(video, signal)

        const funcConfig = parseFuncs.find((item) => item.name === funcName)
        const logName = funcConfig?.label || funcName

        scraperContext.logger.separator()
        scraperContext.logger.log(`开始刮削：`, videoObjFormat(video))
        scraperFieldRunning.value = true

        try {
            onProgress(5)
            if (getAbortResult(signal, onProgress)) return

            // 先确保有网页内容
            if (!(await ensureContent(scraperContext, funcs))) {
                onProgress(100)
                return
            }

            if (getAbortResult(signal, onProgress)) return

            onProgress(60)

            // 执行解析
            const success = await parseField(scraperContext, funcs, funcName, logName)
            if (getAbortResult(signal, onProgress)) return

            if (success === null) {
                scraperContext.logger.log(`${logName}解析跳过！`)
                toast.info(`${logName}解析跳过！`)
            } else if (!success) {
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
                numSuccess = (await funcs.parseNum()) ?? false
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
                scraperContext.logger.success(`刮削结束：`, videoObjFormat(video))
            } else {
                scraperContext.logger.warn(`刮削结束：`, videoObjFormat(video))
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

        // 创建新的刮削器方法实例
        if (!funcs) funcs = scraperContext.scraper.createScraperVideoFuncs(video, signal)

        scraperContext.logger.separator()
        scraperContext.logger.log(`开始刮削：`, videoObjFormat(video))
        scraperAllRunning.value = true

        try {
            onProgress(5)
            if (getAbortResult(signal, onProgress)) return

            // 先确保有网页内容
            if (!(await ensureContent(scraperContext, funcs))) {
                onProgress(100)
                return
            }

            if (getAbortResult(signal, onProgress)) return

            onProgress(10)

            const currentFuncs = funcs
            const failed: string[] = []
            let finishedCount = 0

            const parseResults = await Promise.all(
                parseFuncs.map(async ({ name, label }) => {
                    if (signal.aborted) return { label, re: false }
                    const re = await parseField(scraperContext, currentFuncs, name, label)

                    finishedCount++
                    // 按完成数量推进进度
                    onProgress(10 + (finishedCount * 90) / parseFuncs.length)

                    return { label, re }
                })
            )

            if (getAbortResult(signal, onProgress)) return

            for (const { label, re } of parseResults) {
                if (re === false) {
                    failed.push(label)
                }
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

            scraperContext.logger.success(`刮削结束：`, videoObjFormat(video))
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
        sourceVideoFile: IVideoFile,
        signal: AbortSignal
    ): Promise<IResultWithError<boolean>> {
        const scraperContext = getScraperContext(video)
        if (!scraperContext) {
            return { error: '未找到对应的刮削器！', hasError: true }
        }

        // 创建新的刮削器方法实例
        if (!funcs) funcs = scraperContext.scraper.createScraperVideoFuncs(video, signal)

        const settings = settingsStore()

        const { dir, fileName } = await funcs.parseOutput()
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
