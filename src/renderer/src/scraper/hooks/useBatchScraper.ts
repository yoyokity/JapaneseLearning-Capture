import type { IResultWithError, Path } from '@renderer/helper'
import type { IVideo, IVideoFile } from '@renderer/scraper'
import type { IScraperContext, ScraperState } from '@renderer/scraper/hooks/type'

import { LogHelper, PathHelper, TaskHelper } from '@renderer/helper'
import { Scraper } from '@renderer/scraper'
import { parseFuncs } from '@renderer/scraper/hooks/type'
import { settingsStore } from '@renderer/stores'
import { ref, toRaw } from 'vue'

/**
 * 批量刮削界面的刮削Hook
 */
export function useBatchScraper() {
    const progressValue = ref(0)

    const _scraperWarnText = ref('')

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
     */
    async function scraperRun(
        search: { title: string; num?: Record<string, string> },
        sourceVideoPath: Path,
        scraperName: string
    ): Promise<{ scraperState: ScraperState; scraperStateText?: string }> {
        // 进度条重置
        progressValue.value = 5
        _scraperWarnText.value = ''

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
        const hasContent = await TaskHelper.queueWithInterval('scraper', 0, true, async () => {
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
        })

        if (!hasContent) {
            progressValue.value = 100
            return { scraperState: 'error', scraperStateText: '获取网页内容失败！' }
        }

        progressValue.value = 10

        // 依次刮削其余信息
        const failed: string[] = []
        for (const { name, label } of parseFuncs) {
            const re = await TaskHelper.queueWithInterval('scraper', 0, true, async () => {
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
            })

            // 进度条增加
            progressValue.value += 85 / parseFuncs.length

            // 解析失败，则跳过解析下一个
            if (re === false) {
                failed.push(label)
            }
        }

        if (failed.length > 0) {
            _scraperWarnText.value = `以下字段解析失败：${failed.join('、')}`
        } else if (failed.length === parseFuncs.length) {
            context.logger.warn('全部信息解析失败！')
            progressValue.value = 100
            return { scraperState: 'error', scraperStateText: '全部信息解析失败！' }
        } else {
            context.logger.success('全部信息解析成功！')
        }

        // 保存
        const settings = settingsStore()

        const videoDir: IResultWithError<Path> = await TaskHelper.queueWithInterval(
            'scraper',
            0,
            true,
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

        progressValue.value = 100

        if (videoDir.hasError) {
            context.logger.warn(`保存失败：`, videoDir.error)
            return {
                scraperState: 'error',
                scraperStateText: `${_scraperWarnText}\n${videoDir.error}`
            }
        }

        // 完成
        context.logger.success(`刮削完成！`, toRaw(video))
        context.logger.success(`保存路径：${videoDir.result.parent}`)

        // 有warn
        if (_scraperWarnText.value) {
            context.logger.warn(_scraperWarnText.value)
            return { scraperState: 'warn', scraperStateText: _scraperWarnText.value }
        }

        return { scraperState: 'success' }
    }

    return {
        /**
         * 刮削进度
         * @remarks 0-100
         */
        progressValue,
        /**
         * 刮削一个完整的视频，同时自动保存
         */
        scraperRun
    }
}
