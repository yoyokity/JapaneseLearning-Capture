import type { IResultWithError, Path } from '@renderer/helper'
import type { IScraperVideoFuncs, IVideo, VideoFileWithoutStats } from '@renderer/scraper'
import type { IScraperContext, ScraperState } from '@renderer/scraper/hooks/type'

import { LogHelper, PathHelper } from '@renderer/helper'
import { createVideo, Scraper, videoObjFormat } from '@renderer/scraper'
import { parseFuncs } from '@renderer/scraper/hooks/type'
import { settingsStore } from '@renderer/stores'

interface IScraperRunResult {
    scraperState: ScraperState
    scraperStateText?: string
    videoFile?: VideoFileWithoutStats
}

/**
 * 批量刮削界面的刮削Hook
 */
export function useBatchScraper() {
    const settings = settingsStore()

    /**
     * 获取刮削上下文
     */
    function getScraperContext(scraperName: string): IScraperContext | null {
        const scraper = Scraper.getScraperInstance(scraperName)
        if (!scraper) {
            return null
        }

        const log = LogHelper.title(scraperName)
        return { scraper, logger: log }
    }

    /**
     * 获取取消结果
     */
    function getAbortResult(signal: AbortSignal): IScraperRunResult | null {
        if (!signal.aborted) {
            return null
        }

        return { scraperState: 'error' }
    }

    /**
     * 保存刮削结果
     */
    async function saveVideo(
        video: IVideo,
        sourceVideoPath: Path,
        funcs: IScraperVideoFuncs
    ): Promise<IResultWithError<Path>> {
        try {
            const sourceVideoFile: VideoFileWithoutStats = {
                path: sourceVideoPath,
                dir: sourceVideoPath.parent,
                fileName: sourceVideoPath.filename,
                extname: sourceVideoPath.extname,
                nfoPath: PathHelper.newPath(''),
                ...video
            }

            const { dir, fileName } = await funcs.parseOutput()
            const scraperPath = settings.scraperPath[video.scraperName]

            return await Scraper.createDirectory(
                PathHelper.newPath(scraperPath),
                video,
                sourceVideoFile,
                dir,
                fileName
            )
        } catch (error) {
            return {
                result: null,
                hasError: true,
                error: String(error)
            }
        }
    }

    /**
     * 刮削一个完整的视频，同时自动保存
     * @returns 返回刮削结果
     * scraperState 为 error 时，scraperStateText 表示失败原因，videoFile 不存在
     * scraperState 为 success 时，videoFile 表示生成后的文件信息，scraperStateText 不存在
     * scraperState 为 warn 时，videoFile 表示生成后的文件信息，scraperStateText 表示警告内容
     */
    async function scraperRun(
        search: { title: string; num?: Record<string, string> },
        sourceVideoPath: Path,
        scraperName: string,
        signal: AbortSignal,
        onProgress: (progress: number) => void
    ): Promise<IScraperRunResult> {
        // 确认文件是否存在
        if (!(await sourceVideoPath.isExist())) {
            onProgress(100)
            LogHelper.warn(`找不到本地视频文件：${sourceVideoPath}`)
            return { scraperState: 'error', scraperStateText: '找不到本地视频文件！' }
        }

        let scraperWarnText = ''

        // 进度条重置
        onProgress(5)

        const scraperContext = getScraperContext(scraperName)
        if (!scraperContext) {
            LogHelper.warn(`未找到刮削器：${scraperName}`)
            return { scraperState: 'error', scraperStateText: '未找到对应的刮削器！' }
        }

        // 创建新的video对象
        const video: IVideo = createVideo({
            scraperName,
            title: search.title,
            originaltitle: search.title,
            sorttitle: search.title,
            num: search.num || {}
        })

        // 创建新的刮削器方法实例
        const funcs = scraperContext.scraper.createScraperVideoFuncs(video, signal)

        scraperContext.logger.separator()
        scraperContext.logger.log(`开始刮削：`, videoObjFormat(video))

        const abortResult = getAbortResult(signal)
        if (abortResult) return abortResult

        // 先确保有网页内容
        const hasContentResult = await (async () => {
            try {
                scraperContext.logger.log(`获取网页内容中...`)
                const re = await funcs.getWebContext()

                const contentAbortResult = getAbortResult(signal)
                if (contentAbortResult) return false

                if (!re) {
                    scraperContext.logger.warn(`获取网页内容失败！`)
                    return false
                }

                return true
            } catch (error) {
                scraperContext.logger.error(`获取网页内容出错！`, error)
                return false
            }
        })()

        const contentAbortResult = getAbortResult(signal)
        if (contentAbortResult) return contentAbortResult

        if (!hasContentResult) {
            onProgress(100)
            return { scraperState: 'error', scraperStateText: '获取网页内容失败！' }
        }

        onProgress(10)

        const failed: string[] = []
        let finishedCount = 0

        // 并发刮削其余信息
        const parseResults = await Promise.all(
            parseFuncs.map(async ({ name, label }) => {
                if (signal.aborted) return { label, re: false }

                try {
                    scraperContext.logger.log(`解析${label}...`)

                    const re = (await funcs[name]()) as boolean | null

                    if (re === false) {
                        scraperContext.logger.warn(`解析${label}失败！`)
                    }

                    if (re === null) {
                        scraperContext.logger.log(`解析${label}跳过。`)
                    }

                    return { label, re }
                } catch (error) {
                    scraperContext.logger.error(`解析${label}出错！`, error)
                    return { label, re: false }
                } finally {
                    finishedCount++
                    // 按完成数量推进进度
                    onProgress(10 + (finishedCount * 85) / parseFuncs.length)
                }
            })
        )

        const parseAfterAbortResult = getAbortResult(signal)
        if (parseAfterAbortResult) return parseAfterAbortResult

        for (const { label, re } of parseResults) {
            if (re === false) {
                failed.push(label)
            }
        }

        if (failed.length === parseFuncs.length) {
            scraperContext.logger.warn('全部信息解析失败！')
            onProgress(100)
            return {
                scraperState: 'error',
                scraperStateText: '全部信息解析失败！'
            }
        } else if (failed.length > 0) {
            scraperWarnText = `以下字段解析失败：${failed.join('、')}`
        } else {
            scraperContext.logger.success('全部信息解析成功！')
        }

        const saveAbortResult = getAbortResult(signal)
        if (saveAbortResult) return saveAbortResult

        // 保存
        const videoDir = await saveVideo(video, sourceVideoPath, funcs)

        onProgress(100)

        if (videoDir.hasError) {
            scraperContext.logger.warn(`保存失败：`, videoDir.error)
            return {
                scraperState: 'error',
                scraperStateText: `${scraperWarnText}\n${videoDir.error}`
            }
        }

        // 生成videoFile
        const videoFile: VideoFileWithoutStats = {
            path: videoDir.result,
            dir: videoDir.result.parent,
            fileName: videoDir.result.basename,
            extname: videoDir.result.extname,
            nfoPath: videoDir.result.parent.join(`${videoDir.result.basename}.nfo`),
            ...video
        }

        // 完成
        scraperContext.logger.success(`刮削完成！`, videoObjFormat(videoFile))
        scraperContext.logger.success(`保存路径：${videoDir.result.parent}`)

        // 有warn
        if (scraperWarnText) {
            scraperContext.logger.warn(scraperWarnText)
            return { scraperState: 'warn', scraperStateText: scraperWarnText, videoFile }
        }

        return { scraperState: 'success', videoFile }
    }

    return {
        /**
         * 刮削一个完整的视频，同时自动保存
         */
        scraperRun
    }
}
