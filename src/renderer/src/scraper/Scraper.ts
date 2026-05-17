import type { IResultWithError, Path } from '@renderer/helper'
import type { IVideo, VideoFileWithoutStats } from '@renderer/scraper/Video'

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

/**
 * 根据编号源推导视频编号字段类型
 */
export type IVideoWithNumSource<TNumSource extends Record<string, string>> = Omit<IVideo, 'num'> & {
    num: Record<keyof TNumSource, string>
}

export interface IScraperVideoFuncs {
    /**
     * 0. 获取网页上下文
     * @returns 解析成功返回true，解析失败或中断触发返回false
     */
    getWebContext: () => Promise<boolean>
    /**
     * 1. 解析大标题
     * @returns 解析成功返回true，解析失败或中断触发返回false，解析跳过返回null
     */
    parseTitle: () => Promise<boolean | null>
    /**
     * 2. 解析原始标题
     * @returns 解析成功返回true，解析失败或中断触发返回false，解析跳过返回null
     */
    parseOriginaltitle: () => Promise<boolean | null>
    /**
     * 3. 解析排序标题
     * @returns 解析成功返回true，解析失败或中断触发返回false，解析跳过返回null
     */
    parseSorttitle: () => Promise<boolean | null>
    /**
     * 4. 解析宣传词
     * @returns 解析成功返回true，解析失败或中断触发返回false，解析跳过返回null
     */
    parseTagline: () => Promise<boolean | null>
    /**
     * 5. 解析编号
     * @returns 解析成功返回true，解析失败或中断触发返回false，解析跳过返回null
     */
    parseNum: () => Promise<boolean | null>
    /**
     * 6. 解析分级
     * @returns 解析成功返回true，解析失败或中断触发返回false，解析跳过返回null
     */
    parseMpaa: () => Promise<boolean | null>
    /**
     * 7. 解析评分
     * @description 以10分为满分
     * @returns 解析成功返回true，解析失败或中断触发返回false，解析跳过返回null
     */
    parseRating: () => Promise<boolean | null>
    /**
     * 8.解析导演
     * @returns 解析成功返回true，解析失败或中断触发返回false，解析跳过返回null
     */
    parseDirector: () => Promise<boolean | null>
    /**
     * 9. 解析演员
     * @returns 解析成功返回true，解析失败或中断触发返回false，解析跳过返回null
     */
    parseActor: () => Promise<boolean | null>
    /**
     * 10. 解析发行商
     * @returns 解析成功返回true，解析失败或中断触发返回false，解析跳过返回null
     */
    parseStudio: () => Promise<boolean | null>
    /**
     * 11. 解析制片商
     * @returns 解析成功返回true，解析失败或中断触发返回false，解析跳过返回null
     */
    parseMaker: () => Promise<boolean | null>
    /**
     * 12. 解析影片系列
     * @returns 解析成功返回true，解析失败或中断触发返回false，解析跳过返回null
     */
    parseSet: () => Promise<boolean | null>
    /**
     * 13. 解析影片标签
     * @returns 解析成功返回true，解析失败或中断触发返回false，解析跳过返回null
     */
    parseTag: () => Promise<boolean | null>
    /**
     * 14. 解析影片类型
     * @returns 解析成功返回true，解析失败或中断触发返回false，解析跳过返回null
     */
    parseGenre: () => Promise<boolean | null>
    /**
     * 15. 解析简介
     * @returns 解析成功返回true，解析失败或中断触发返回false，解析跳过返回null
     */
    parsePlot: () => Promise<boolean | null>
    /**
     * 16. 解析发行年份
     * @returns 解析成功返回true，解析失败或中断触发返回false，解析跳过返回null
     */
    parseYear: () => Promise<boolean | null>
    /**
     * 17. 解析首映日期
     * @returns 解析成功返回true，解析失败或中断触发返回false，解析跳过返回null
     */
    parsePremiered: () => Promise<boolean | null>
    /**
     * 18. 解析上映日期
     * @returns 解析成功返回true，解析失败或中断触发返回false，解析跳过返回null
     */
    parseReleasedate: () => Promise<boolean | null>
    /**
     * 19. 解析视频封面
     * @returns 解析成功返回true，解析失败或中断触发返回false，解析跳过返回null
     */
    parsePoster: () => Promise<boolean | null>
    /**
     * 20. 解析视频缩略图
     * @returns 解析成功返回true，解析失败或中断触发返回false，解析跳过返回null
     */
    parseThumb: () => Promise<boolean | null>
    /**
     * 21. 解析视频背景图
     * @returns 解析成功返回true，解析失败或中断触发返回false，解析跳过返回null
     */
    parseFanart: () => Promise<boolean | null>
    /**
     * 22. 解析视频额外背景图
     * @returns 解析成功返回true，解析失败或中断触发返回false，解析跳过返回null
     */
    parseExtrafanart: () => Promise<boolean | null>
    /**
     * 解析视频输出信息
     * @remarks 是相对路径，最终目录的绝对路径=刮削器输出路径+这个相对路径
     * @returns dir是输出目录的相对路径，fileName是视频文件名
     */
    parseOutput: () => Promise<{ dir: string; fileName: string }>
}

export interface IScraper {
    /**
     * 刮削器名称
     */
    scraperName: string
    /**
     * 编号源
     * @remarks 刮削器刮削时，信息网站的名称和url
     * @remarks url用{num}作为占位符，例如 https://www.getchu.com/soft.phtml?id={num}&gc=gc
     */
    numSource: Record<string, string>
    /**
     * 刮削视频信息的方法
     */
    createScraperVideoFuncs: (video: IVideo, signal: AbortSignal) => IScraperVideoFuncs
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

            if (
                !scraper.createScraperVideoFuncs ||
                typeof scraper.createScraperVideoFuncs !== 'function'
            ) {
                LogHelper.error(`${path} 缺少有效的createScraperVideoFuncs方法，此刮削器加载失败`)
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
     * 获取当前刮削器实例
     */
    static getCurrentScraperInstance() {
        const settings = settingsStore()
        return Scraper.instances.find((scraper) => scraper.scraperName === settings.currentScraper)
    }

    /**
     * 获取当前刮削器路径
     */
    static getCurrentScraperPath() {
        const settings = settingsStore()
        return settings.scraperPath[settings.currentScraper]
    }

    /**
     * 创建视频目录
     * @description 包括完成视频、nfo文件、图片
     * @param scraperPath 目标刮削器设置的目录
     * @param video 视频信息
     * @param sourceVideoFile 原视频文件信息
     * @param dir 视频目录的相对路径（最终目录是scraperPath + dir）
     * @param fileName 不包含后缀的视频名
     * @returns 最终的视频文件的完整路径
     */
    static async createDirectory(
        scraperPath: Path,
        video: IVideo,
        sourceVideoFile: VideoFileWithoutStats,
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
                sourceVideoFile.nfoPath &&
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
                video.extrafanart.length > 0 &&
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

            return { result: _videoPath, hasError: false }
        } catch (error) {
            // 统一处理保存过程中的异常
            const errorMessage = error instanceof Error ? error.message : String(error)
            LogHelper.error(`保存刮削结果异常：${errorMessage}`)
            return { error: `保存刮削结果失败！`, hasError: true }
        }
    }
}
