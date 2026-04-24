import type { IResultWithError, Path } from '@renderer/helper'
import type { IVideo, IVideoFile } from '@renderer/scraper'
import type { IScraperContext, ScraperState } from '@renderer/scraper/hooks/type'

import { LogHelper, PathHelper, TaskHelper } from '@renderer/helper'
import { Scraper } from '@renderer/scraper'
import { parseFuncs } from '@renderer/scraper/hooks/type'
import { settingsStore } from '@renderer/stores'
import { toRaw } from 'vue'

/**
 * 批量刮削界面的刮削Hook
 */
export function useBatchScraper() {
    const batchSingleTaskName = 'scraper-batch-single'

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
        onProgress: (progress: number) => void
    ): Promise<{ scraperState: ScraperState; scraperStateText?: string; videoFile?: IVideoFile }> {
        // 确认文件是否存在
        if (!(await sourceVideoPath.isExist())) {
            onProgress(100)
            LogHelper.warn(`找不到本地视频文件：${sourceVideoPath}`)
            return { scraperState: 'error', scraperStateText: '找不到本地视频文件！' }
        }

        let scraperWarnText = ''

        // 进度条重置
        onProgress(5)

        const context = getScraperContext(scraperName)
        if (!context) {
            LogHelper.warn(`未找到刮削器：${scraperName}`)
            return { scraperState: 'error', scraperStateText: '未找到对应的刮削器！' }
        }

        // 创建新的video对象
        const video: IVideo = {
            scraperName,
            title: search.title,
            originaltitle: search.title,
            sorttitle: search.title,
            tagline: '',
            num: search.num || {},
            mpaa: '',
            rating: '',
            director: '',
            actor: [],
            studio: '',
            maker: '',
            set: '',
            tag: [],
            genre: [],
            plot: '',
            year: '',
            premiered: '',
            releasedate: '',
            poster: null,
            thumb: null,
            fanart: null,
            extrafanart: []
        }

        context.logger.separator()
        context.logger.log(`开始刮削：`, toRaw(video))

        const _context = context.scraper.createContext()

        // 先确保有网页内容
        const hasContentResult = await TaskHelper.queueWithCancel(
            { taskName: batchSingleTaskName },
            async () => {
                try {
                    context.logger.log(`获取网页内容中...`)
                    if (!(await context.scraper.scraperVideoFuncs.getWebContext(video, _context))) {
                        context.logger.error(`获取网页内容失败！`)
                        return false
                    }

                    return true
                } catch (error) {
                    context.logger.error(`获取网页内容出错！`, error)
                    return false
                }
            }
        )

        if (hasContentResult.cancel) {
            onProgress(100)
            return { scraperState: 'error', scraperStateText: '刮削已取消！' }
        }

        if (!hasContentResult.result) {
            onProgress(100)
            return { scraperState: 'error', scraperStateText: '获取网页内容失败！' }
        }

        onProgress(10)

        // 依次刮削其余信息
        const failed: string[] = []
        for (const [index, { name, label }] of parseFuncs.entries()) {
            const re = await TaskHelper.queueWithCancel(
                { taskName: batchSingleTaskName },
                async () => {
                    try {
                        context.logger.log(`解析${label}...`)

                        const func = context.scraper.scraperVideoFuncs[name] as (
                            video: IVideo,
                            content: unknown
                        ) => Promise<boolean | null>
                        const _re = await func(video, _context)

                        if (_re === false) {
                            context.logger.warn(`解析${label}失败！`)
                        }

                        if (_re === null) {
                            context.logger.log(`解析${label}跳过。`)
                        }

                        return _re
                    } catch (error) {
                        context.logger.error(`解析${label}出错！`, error)
                        return false
                    }
                }
            )

            if (re.cancel) {
                onProgress(100)
                return { scraperState: 'error', scraperStateText: '刮削已取消！' }
            }

            // 进度条增加
            onProgress(10 + ((index + 1) * 85) / parseFuncs.length)

            // 解析失败，则跳过解析下一个
            if (re.result === false) {
                failed.push(label)
            }
        }

        if (failed.length === parseFuncs.length) {
            context.logger.warn('全部信息解析失败！')
            onProgress(100)
            return {
                scraperState: 'error',
                scraperStateText: '全部信息解析失败！'
            }
        } else if (failed.length > 0) {
            scraperWarnText = `以下字段解析失败：${failed.join('、')}`
        } else {
            context.logger.success('全部信息解析成功！')
        }

        // 保存
        const settings = settingsStore()

        const videoDir = await TaskHelper.queueWithCancel<IResultWithError<Path>>(
            { taskName: batchSingleTaskName },
            async () => {
                const sourceVideoFile: IVideoFile = {
                    path: sourceVideoPath,
                    dir: sourceVideoPath.parent,
                    fileName: sourceVideoPath.filename,
                    extname: sourceVideoPath.extname,
                    nfoPath: PathHelper.newPath(''),
                    ...video
                }

                const { dir, fileName } = await context.scraper.scraperVideoFuncs.parseOutput(
                    video,
                    _context
                )
                const scraperPath = settings.scraperPath[video.scraperName]

                return await Scraper.createDirectory(
                    PathHelper.newPath(scraperPath),
                    video,
                    sourceVideoFile,
                    dir,
                    fileName
                )
            }
        )

        if (videoDir.cancel) {
            onProgress(100)
            return { scraperState: 'error', scraperStateText: '刮削已取消！' }
        }

        onProgress(100)

        if (videoDir.result.hasError) {
            context.logger.warn(`保存失败：`, videoDir.result.error)
            return {
                scraperState: 'error',
                scraperStateText: `${scraperWarnText}\n${videoDir.result.error}`
            }
        }

        // 完成
        context.logger.success(`刮削完成！`, toRaw(video))
        context.logger.success(`保存路径：${videoDir.result.result.parent}`)

        // 生成videoFile
        const videoFile: IVideoFile = {
            path: videoDir.result.result,
            dir: videoDir.result.result.parent,
            fileName: videoDir.result.result.basename,
            extname: videoDir.result.result.extname,
            nfoPath: videoDir.result.result.parent.join(`${videoDir.result.result.basename}.nfo`),
            ...video
        }

        // 有warn
        if (scraperWarnText) {
            context.logger.warn(scraperWarnText)
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
