import type { IRequestOptions } from '@renderer/helper'
import type { IScraper, IScraperVideoValueFuncs, IVideo } from '@renderer/scraper'
import type { SaveImageOptions } from '@shared'

import { NetHelper } from '@renderer/helper'
import { LogHelper } from '@renderer/helper/LogHelper'
import { MediaHelper } from '@renderer/helper/MediaHelper'

/**
 * 刮削器辅助类
 */
export class ScraperHelper {
    private static downloadImageCache = new Map<string, string>()

    private static getCacheKey(url: string, saveOptions?: SaveImageOptions) {
        return `${url}-${JSON.stringify(saveOptions)}`
    }

    /**
     * 定义一个新的刮削器
     * @param scraperName 刮削器名称
     * @param numSource 编号源
     * @param createScraperVideoFuncs 刮削视频信息的方法
     * @remarks 编号源是刮削器刮削时，信息网站的名称和url， url用{num}作为占位符，例如 https://www.getchu.com/soft.phtml?id={num}&gc=gc
     */
    static defineScraper<TNumSource extends Record<string, string>>(
        scraperName: string,
        numSource: TNumSource,
        createScraperVideoFuncs: (
            video: IVideo,
            signal: AbortSignal
        ) => Omit<IScraperVideoValueFuncs, 'parseNum'> & {
            parseNum: () => Promise<TNumSource | false | null>
        }
    ): IScraper {
        return {
            scraperName,
            numSource,
            createScraperVideoFuncs: (video, signal) => {
                const funcs = createScraperVideoFuncs(video, signal)
                const wrapParseFunc = async <TValue>(
                    parseFunc: () => Promise<TValue | false | null>,
                    setValue: (value: TValue) => void
                ): Promise<boolean | null> => {
                    const re = await parseFunc()
                    if (re) {
                        setValue(re)
                        return true
                    }

                    return re as false | null
                }

                return {
                    getWebContext: funcs.getWebContext,
                    parseTitle: () =>
                        wrapParseFunc(funcs.parseTitle, (value) => (video.title = value)),
                    parseOriginaltitle: () =>
                        wrapParseFunc(
                            funcs.parseOriginaltitle,
                            (value) => (video.originaltitle = value)
                        ),
                    parseSorttitle: () =>
                        wrapParseFunc(funcs.parseSorttitle, (value) => (video.sorttitle = value)),
                    parseTagline: () =>
                        wrapParseFunc(funcs.parseTagline, (value) => (video.tagline = value)),
                    parseNum: () => wrapParseFunc(funcs.parseNum, (value) => (video.num = value)),
                    parseMpaa: () =>
                        wrapParseFunc(funcs.parseMpaa, (value) => (video.mpaa = value)),
                    parseRating: () =>
                        wrapParseFunc(funcs.parseRating, (value) => (video.rating = value)),
                    parseDirector: () =>
                        wrapParseFunc(funcs.parseDirector, (value) => (video.director = value)),
                    parseActor: () =>
                        wrapParseFunc(funcs.parseActor, (value) => (video.actor = value)),
                    parseStudio: () =>
                        wrapParseFunc(funcs.parseStudio, (value) => (video.studio = value)),
                    parseMaker: () =>
                        wrapParseFunc(funcs.parseMaker, (value) => (video.maker = value)),
                    parseSet: () => wrapParseFunc(funcs.parseSet, (value) => (video.set = value)),
                    parseTag: () => wrapParseFunc(funcs.parseTag, (value) => (video.tag = value)),
                    parseGenre: () =>
                        wrapParseFunc(funcs.parseGenre, (value) => (video.genre = value)),
                    parsePlot: () =>
                        wrapParseFunc(funcs.parsePlot, (value) => (video.plot = value)),
                    parseYear: () =>
                        wrapParseFunc(funcs.parseYear, (value) => (video.year = value)),
                    parsePremiered: () =>
                        wrapParseFunc(funcs.parsePremiered, (value) => (video.premiered = value)),
                    parseReleasedate: () =>
                        wrapParseFunc(
                            funcs.parseReleasedate,
                            (value) => (video.releasedate = value)
                        ),
                    parsePoster: () =>
                        wrapParseFunc(funcs.parsePoster, (value) => (video.poster = value)),
                    parseThumb: () =>
                        wrapParseFunc(funcs.parseThumb, (value) => (video.thumb = value)),
                    parseFanart: () =>
                        wrapParseFunc(funcs.parseFanart, (value) => (video.fanart = value)),
                    parseExtrafanart: () =>
                        wrapParseFunc(
                            funcs.parseExtrafanart,
                            (value) => (video.extrafanart = value)
                        ),
                    parseOutput: funcs.parseOutput
                }
            }
        }
    }

    /**
     * 下载图片到临时目录
     * @remark 每个url的图片只下载一次，后续重复下载直接返回缓存路径
     * @returns 返回临时图片路径
     */
    static async downloadImage(
        url: string,
        netOptions?: Omit<IRequestOptions, 'parse' | 'delay'>,
        saveOptions?: SaveImageOptions
    ) {
        const cacheKey = this.getCacheKey(url, saveOptions)
        const tempPath: string | null = await (async () => {
            let path = this.downloadImageCache.get(cacheKey) ?? null

            if (!path) {
                const re = await NetHelper.getImage(url, netOptions)
                if (!re.ok) return null
                path = await MediaHelper.saveTempImage(re.body, `download_image`)
            }

            if (saveOptions && path) {
                path = await MediaHelper.saveTempImage(path, `download_image`, saveOptions)
            }

            if (path) this.downloadImageCache.set(cacheKey, path)
            return path
        })()

        if (tempPath) {
            LogHelper.log(`下载图片成功！:${url}`)
        } else {
            LogHelper.warn(`下载图片失败！:${url}`)
        }

        return tempPath
    }

    /**
     * 下载剧照到临时目录
     * @remark 每个url的图片只下载一次，后续重复下载直接返回缓存路径
     * @returns 返回临时图片路径
     */
    static async downloadExtrafanart(
        urls: string[],
        netOptions?: Omit<IRequestOptions, 'parse' | 'delay'>
    ) {
        if (urls.length === 0) return []

        const results = await Promise.all(
            urls.map(async (url) => {
                const cachePath = this.downloadImageCache.get(url)
                if (cachePath) {
                    return {
                        url,
                        tempPath: cachePath
                    }
                }

                const re = await NetHelper.getImage(url, netOptions)
                if (!re.ok) {
                    return {
                        url,
                        tempPath: null
                    }
                }

                const tempPath = await MediaHelper.saveTempImage(re.body, `download_extrafanart`)
                if (tempPath) this.downloadImageCache.set(url, tempPath)

                return {
                    url,
                    tempPath
                }
            })
        )

        const extrafanart: string[] = []
        const successUrls: string[] = []
        const failedUrls: string[] = []
        for (const result of results) {
            if (result.tempPath) {
                successUrls.push(result.url)
                extrafanart.push(result.tempPath)
                continue
            }

            failedUrls.push(result.url)
        }

        if (successUrls.length > 0) {
            LogHelper.log(`下载${successUrls.length}张剧照成功`)
        }

        if (failedUrls.length > 0) {
            LogHelper.warn(`下载${failedUrls.length}张剧照失败`, failedUrls)
        }

        return extrafanart
    }
}
