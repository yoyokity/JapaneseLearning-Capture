import type { IResultWithError, Path } from '@renderer/helper'
import type { IVideo, IVideoFile } from '@renderer/scraper/Video'

import { LogHelper, PathHelper } from '@renderer/helper'
import { Nfo } from '@renderer/scraper/Nfo'
import { settingsStore } from '@renderer/stores'
import { isEqual } from 'es-toolkit'

/**
 * 模块导入类型接口
 */
interface IModuleType {
    [key: string]: {
        default: IScraper
    }
}

export interface IScraperVideoFuncs<TContext = unknown> {
    /**
     * 0. 获取网页上下文
     * @param video 视频对象，解析结果直接写入 video
     * @param context 刮削上下文，用于缓存信息
     * @returns 解析成功返回true，解析失败返回false
     */
    getWebContext: (video: IVideo, context: TContext) => Promise<boolean>
    /**
     * 1. 解析大标题
     * @param video 视频对象，解析结果直接写入 video
     * @param context 刮削上下文，用于缓存信息
     * @returns 解析成功返回true，解析失败返回false，解析跳过返回null
     */
    parseTitle: (video: IVideo, context: TContext) => Promise<boolean | null>
    /**
     * 2. 解析原始标题
     * @param video 视频对象，解析结果直接写入 video
     * @param context 刮削上下文，用于缓存信息
     * @returns 解析成功返回true，解析失败返回false，解析跳过返回null
     */
    parseOriginaltitle: (video: IVideo, context: TContext) => Promise<boolean | null>
    /**
     * 3. 解析排序标题
     * @param video 视频对象，解析结果直接写入 video
     * @param context 刮削上下文，用于缓存信息
     * @returns 解析成功返回true，解析失败返回false，解析跳过返回null
     */
    parseSorttitle: (video: IVideo, context: TContext) => Promise<boolean | null>
    /**
     * 4. 解析宣传词
     * @param video 视频对象，解析结果直接写入 video
     * @param context 刮削上下文，用于缓存信息
     * @returns 解析成功返回true，解析失败返回false，解析跳过返回null
     */
    parseTagline: (video: IVideo, context: TContext) => Promise<boolean | null>
    /**
     * 5. 解析编号
     * @param video 视频对象，解析结果直接写入 video
     * @param context 刮削上下文，用于缓存信息
     * @returns 解析成功返回true，解析失败返回false，解析跳过返回null
     */
    parseNum: (video: IVideo, context: TContext) => Promise<boolean | null>
    /**
     * 6. 解析分级
     * @param video 视频对象，解析结果直接写入 video
     * @param context 刮削上下文，用于缓存信息
     * @returns 解析成功返回true，解析失败返回false，解析跳过返回null
     */
    parseMpaa: (video: IVideo, context: TContext) => Promise<boolean | null>
    /**
     * 7. 解析评分
     * @description 以10分为满分
     * @param video 视频对象，解析结果直接写入 video
     * @param context 刮削上下文，用于缓存信息
     * @returns 解析成功返回true，解析失败返回false，解析跳过返回null
     */
    parseRating: (video: IVideo, context: TContext) => Promise<boolean | null>
    /**
     * 8.解析导演
     * @param video 视频对象，解析结果直接写入 video
     * @param context 刮削上下文，用于缓存信息
     * @returns 解析成功返回true，解析失败返回false，解析跳过返回null
     */
    parseDirector: (video: IVideo, context: TContext) => Promise<boolean | null>
    /**
     * 9. 解析演员
     * @param video 视频对象，解析结果直接写入 video
     * @param context 刮削上下文，用于缓存信息
     * @returns 解析成功返回true，解析失败返回false，解析跳过返回null
     */
    parseActor: (video: IVideo, context: TContext) => Promise<boolean | null>
    /**
     * 10. 解析发行商
     * @param video 视频对象，解析结果直接写入 video
     * @param context 刮削上下文，用于缓存信息
     * @returns 解析成功返回true，解析失败返回false，解析跳过返回null
     */
    parseStudio: (video: IVideo, context: TContext) => Promise<boolean | null>
    /**
     * 11. 解析制片商
     * @param video 视频对象，解析结果直接写入 video
     * @param context 刮削上下文，用于缓存信息
     * @returns 解析成功返回true，解析失败返回false，解析跳过返回null
     */
    parseMaker: (video: IVideo, context: TContext) => Promise<boolean | null>
    /**
     * 12. 解析影片系列
     * @param video 视频对象，解析结果直接写入 video
     * @param context 刮削上下文，用于缓存信息
     * @returns 解析成功返回true，解析失败返回false，解析跳过返回null
     */
    parseSet: (video: IVideo, context: TContext) => Promise<boolean | null>
    /**
     * 13. 解析影片标签
     * @param video 视频对象，解析结果直接写入 video
     * @param context 刮削上下文，用于缓存信息
     * @returns 解析成功返回true，解析失败返回false，解析跳过返回null
     */
    parseTag: (video: IVideo, context: TContext) => Promise<boolean | null>
    /**
     * 14. 解析影片类型
     * @param video 视频对象，解析结果直接写入 video
     * @param context 刮削上下文，用于缓存信息
     * @returns 解析成功返回true，解析失败返回false，解析跳过返回null
     */
    parseGenre: (video: IVideo, context: TContext) => Promise<boolean | null>
    /**
     * 15. 解析简介
     * @param video 视频对象，解析结果直接写入 video
     * @param context 刮削上下文，用于缓存信息
     * @returns 解析成功返回true，解析失败返回false，解析跳过返回null
     */
    parsePlot: (video: IVideo, context: TContext) => Promise<boolean | null>
    /**
     * 16. 解析发行年份
     * @param video 视频对象，解析结果直接写入 video
     * @param context 刮削上下文，用于缓存信息
     * @returns 解析成功返回true，解析失败返回false，解析跳过返回null
     */
    parseYear: (video: IVideo, context: TContext) => Promise<boolean | null>
    /**
     * 17. 解析首映日期
     * @param video 视频对象，解析结果直接写入 video
     * @param context 刮削上下文，用于缓存信息
     * @returns 解析成功返回true，解析失败返回false，解析跳过返回null
     */
    parsePremiered: (video: IVideo, context: TContext) => Promise<boolean | null>
    /**
     * 18. 解析上映日期
     * @param video 视频对象，解析结果直接写入 video
     * @param context 刮削上下文，用于缓存信息
     * @returns 解析成功返回true，解析失败返回false，解析跳过返回null
     */
    parseReleasedate: (video: IVideo, context: TContext) => Promise<boolean | null>
    /**
     * 19. 解析视频封面
     * @param video 视频对象，解析结果直接写入 video
     * @param context 刮削上下文，用于缓存信息
     * @returns 解析成功返回true，解析失败返回false，解析跳过返回null
     */
    parsePoster: (video: IVideo, context: TContext) => Promise<boolean | null>
    /**
     * 20. 解析视频缩略图
     * @param video 视频对象，解析结果直接写入 video
     * @param context 刮削上下文，用于缓存信息
     * @returns 解析成功返回true，解析失败返回false，解析跳过返回null
     */
    parseThumb: (video: IVideo, context: TContext) => Promise<boolean | null>
    /**
     * 21. 解析视频背景图
     * @param video 视频对象，解析结果直接写入 video
     * @param context 刮削上下文，用于缓存信息
     * @returns 解析成功返回true，解析失败返回false，解析跳过返回null
     */
    parseFanart: (video: IVideo, context: TContext) => Promise<boolean | null>
    /**
     * 22. 解析视频额外背景图
     * @param video 视频对象，解析结果直接写入 video
     * @param context 刮削上下文，用于缓存信息
     * @returns 解析成功返回true，解析失败返回false，解析跳过返回null
     */
    parseExtrafanart: (video: IVideo, context: TContext) => Promise<boolean | null>
    /**
     * 解析视频输出信息
     * @param video 视频对象，解析结果直接写入 video
     * @param context 刮削上下文，用于缓存信息
     * @remarks 是相对路径，最终目录的绝对路径=刮削器输出路径+这个相对路径
     * @returns dir是输出目录的相对路径，fileName是视频文件名
     */
    parseOutput: (video: IVideo, context: TContext) => Promise<{ dir: string; fileName: string }>
}

export interface IScraper<TContext = unknown> {
    /**
     * 刮削器名称
     */
    scraperName: string
    /**
     * 检查连接
     */
    checkConnect: () => Promise<boolean>
    /**
     * 编号源
     * @remarks 刮削器刮削时，信息网站的名称和url
     * @remarks url用{num}作为占位符，例如 https://www.getchu.com/soft.phtml?id={num}&gc=gc
     */
    numSource: Record<string, string>
    /**
     * 上下文缓存创建方法
     */
    createContext: () => TContext
    /**
     * 刮削视频信息的方法
     */
    scraperVideoFuncs: IScraperVideoFuncs<TContext>
}

export class Scraper {
    /**
     * 刮削器实例对象列表
     */
    static instances: IScraper[] = (() => {
        const instances: IScraper[] = []
        const modules = {
            ...((import.meta.glob('../plugins/*.ts', { eager: true }) as IModuleType) ?? {}),
            ...((import.meta.glob('../plugins/*/index.ts', { eager: true }) as IModuleType) ?? {})
        }
        for (const path in modules) {
            const module = modules[path]
            const scraper = module.default

            // 检查scraper是否符合IScraper接口
            if (!scraper || typeof scraper !== 'object') {
                LogHelper.error(`${path} 导出的默认对象不是有效对象，此刮削器加载失败`)
                continue
            }

            // 检查必要的属性和方法
            if (!scraper.scraperName || typeof scraper.scraperName !== 'string') {
                LogHelper.error(`${path} 缺少有效的scraperName属性，此刮削器加载失败`)
                continue
            }

            if (!scraper.checkConnect || typeof scraper.checkConnect !== 'function') {
                LogHelper.error(`${path} 缺少有效的checkConnect方法，此刮削器加载失败`)
                continue
            }

            if (!scraper.scraperVideoFuncs || typeof scraper.scraperVideoFuncs !== 'object') {
                LogHelper.error(`${path} 缺少有效的scraperVideoFuncs方法，此刮削器加载失败`)
                continue
            }

            instances.push(scraper)
        }
        return instances
    })()

    /**
     * 获取刮削器实例
     */
    static getScraperInstance(scraperName: string) {
        return Scraper.instances.find((scraper) => scraper.scraperName === scraperName)
    }

    /**
     * 获取当前刮削器路径
     */
    static getCurrentScraperPath() {
        const settings = settingsStore()
        return settings.scraperPath[settings.currentScraper]
    }

    /**
     * 获取当前刮削器实例
     */
    static getCurrentScraperInstance() {
        const settings = settingsStore()
        return Scraper.instances.find((scraper) => scraper.scraperName === settings.currentScraper)
    }

    static async createDirectory(
        scraperPath: Path,
        video: IVideo,
        sourceVideoFile: IVideoFile,
        dir: string,
        fileName: string
    ): Promise<IResultWithError<Path>> {
        try {
            // 最终目录
            const videoDir = scraperPath.join(dir)

            // 原视频path
            const _sourceVideoPath = sourceVideoFile.path
            // 视频path
            const _videoPath = videoDir.join(fileName + sourceVideoFile.extname)
            // nfo path
            const _nfoPath = videoDir.join(`${fileName}.nfo`)

            // 不同目录
            const dirDiff = sourceVideoFile.dir.toString() !== videoDir.toString()

            // 如果最终目录和原视频目录不同，则创建最终目录
            if (dirDiff) {
                if (!(await PathHelper.createDirectory(videoDir))) {
                    return { error: '创建新目录失败！', hasError: true }
                }
            }

            // 将视频文件移动到新目录或改名
            if (_sourceVideoPath.toString() !== _videoPath.toString()) {
                if (!(await PathHelper.move(_sourceVideoPath, _videoPath, false))) {
                    return { error: '存在同名视频文件！', hasError: true }
                }
            }

            // 创建nfo文件
            const nfo = Nfo.create(video)
            await nfo.save(_nfoPath)
            LogHelper.success(`- 保存nfo成功！:${_nfoPath}`)

            // 如果有两个nfo，则删除原来的
            if (
                !/[\\/]/.test(sourceVideoFile.nfoPath.toString()) &&
                (await sourceVideoFile.nfoPath.isExist())
            ) {
                if (sourceVideoFile.nfoPath.toString() !== _nfoPath.toString()) {
                    if (!(await PathHelper.remove(sourceVideoFile.nfoPath))) {
                        return { error: '删除原来的nfo文件失败！', hasError: true }
                    }
                }
            }

            // 保存图片
            const imagePromises: Promise<void>[] = []

            if (video.poster && (!isEqual(sourceVideoFile.poster, video.poster) || dirDiff)) {
                const posterPath = videoDir.join('poster.jpg')
                imagePromises.push(
                    PathHelper.copy(video.poster, posterPath).then(() => {
                        LogHelper.success(`- 保存封面poster成功！:${posterPath}`)
                    })
                )
            }

            if (video.thumb && (!isEqual(sourceVideoFile.thumb, video.thumb) || dirDiff)) {
                const thumbPath = videoDir.join('thumb.jpg')
                imagePromises.push(
                    PathHelper.copy(video.thumb, thumbPath).then(() => {
                        LogHelper.success(`- 保存缩略图thumb成功！:${thumbPath}`)
                    })
                )
            }

            if (video.fanart && (!isEqual(sourceVideoFile.fanart, video.fanart) || dirDiff)) {
                const fanartPath = videoDir.join('fanart.jpg')
                imagePromises.push(
                    PathHelper.copy(video.fanart, fanartPath).then(() => {
                        LogHelper.success(`- 保存背景图fanart成功！:${fanartPath}`)
                    })
                )
            }

            // 保存extrafanart
            if (
                video.extrafanart &&
                (!isEqual(sourceVideoFile.extrafanart, video.extrafanart) || dirDiff)
            ) {
                // 清空剧照文件夹
                const result = await PathHelper.clearFolder(videoDir.join('extrafanart'))
                if (result) {
                    const extrafanartPromises: Promise<boolean>[] = []
                    for (let index = 1; index <= video.extrafanart.length; index++) {
                        const extrafanart = video.extrafanart[index - 1]
                        const path = videoDir.join('extrafanart', `extrafanart-${index}.jpg`)
                        extrafanartPromises.push(
                            PathHelper.copy(extrafanart, path)
                                .then(() => true)
                                .catch(() => false)
                        )
                    }

                    imagePromises.push(
                        Promise.all(extrafanartPromises).then((results) => {
                            const successCount = results.filter(Boolean).length
                            const failedCount = results.length - successCount

                            if (successCount > 0) {
                                LogHelper.success(`- 保存${successCount}张剧照成功！`)
                            }

                            if (failedCount > 0) {
                                LogHelper.warn(`- 保存${failedCount}张剧照失败！`)
                            }
                        })
                    )
                }
            }

            await Promise.all(imagePromises)

            return { result: videoDir, hasError: false }
        } catch (error) {
            // 统一处理保存过程中的异常
            const errorMessage = error instanceof Error ? error.message : String(error)
            LogHelper.error(`保存刮削结果异常：${errorMessage}`)
            return { error: `保存刮削结果失败！`, hasError: true }
        }
    }
}
