import type { IScraper, IVideo } from '@renderer/scraper'
import type { IHanimeContext } from './temp'

import { ImageHelper, LogHelper, NetHelper, TransHelper } from '@renderer/helper'
import { dlsiteOptions, getWebContentDlsite } from '@renderer/plugins/Hanime/Dlsite'
import {
    getExtrafanartGetchu,
    getPosterGetchu,
    getWebContentGetchu
} from '@renderer/plugins/Hanime/Getchu'
import { getPosterHanime1, getWebContentHanime1 } from '@renderer/plugins/Hanime/Hanime1'
import { maker_trans } from '@renderer/plugins/Hanime/makerTrans'
import { load as cheerioLoad } from 'cheerio'

import { loggerDlsite, loggerGetchu, scraperName } from './temp'

const hanimeScraper: IScraper<IHanimeContext> = {
    scraperName,
    checkConnect: async () => {
        return true
    },
    numSource: {
        hanime1: 'https://hanime1.me/watch?v={num}',
        getchu: 'https://www.getchu.com/soft.phtml?id={num}&gc=gc',
        dlsite: 'https://www.dlsite.com/pro/work/=/product_id/{num}.html?locale=ja_JP'
    },
    createContext: () => ({
        封面: null,
        超分封面: null,
        num: {
            hanime1: '',
            getchu: '',
            dlsite: ''
        },
        webContent: {
            hanime1: '',
            getchu: '',
            dlsite: ''
        },
        originaltitle: '',
        maker: '',
        tag: []
    }),
    scraperVideoFuncs: {
        getWebContext: async (video: IVideo, context: IHanimeContext, signal: AbortSignal) => {
            if (context.webContent.hanime1) {
                LogHelper.title(scraperName).log('网页内容已获取过，跳过')
                return true
            }

            const searchTitle = video.originaltitle || video.title || video.sorttitle
            context.num.hanime1 = video.num.hanime1 ?? ''
            context.num.getchu = video.num.getchu ?? ''
            context.num.dlsite = video.num.dlsite ?? ''

            // 获取webContent
            await Promise.all([
                getWebContentHanime1(searchTitle, context, signal),
                getWebContentGetchu(searchTitle, context, signal),
                getWebContentDlsite(searchTitle, context, signal)
            ])

            return Boolean(context.webContent.hanime1)
        },
        parseTitle: async (video: IVideo, context: IHanimeContext) => {
            const $ = cheerioLoad(context.webContent.hanime1)
            let title = $('.video-description-panel').children().eq(1).text()
            title = TransHelper.translateSC(title.trim())

            if (!title) return false

            video.title = title
            return true
        },
        parseOriginaltitle: async (video: IVideo, context: IHanimeContext) => {
            const $ = cheerioLoad(context.webContent.hanime1)
            let originaltitle = $('h3#shareBtn-title').text()
            originaltitle = originaltitle.split('[中文字幕]')[0].trim()

            if (!originaltitle) return false

            video.originaltitle = originaltitle
            context.originaltitle = video.originaltitle
            return true
        },
        parseSorttitle: async (video: IVideo, context: IHanimeContext, signal: AbortSignal) => {
            if (!context.originaltitle) {
                if (
                    !(await hanimeScraper.scraperVideoFuncs.parseOriginaltitle(
                        video,
                        context,
                        signal
                    ))
                ) {
                    return false
                }
            }

            video.sorttitle = context.originaltitle
            return true
        },
        parseTagline: async (_video: IVideo, _context: IHanimeContext) => {
            return null
        },
        parseNum: async (video: IVideo, context: IHanimeContext) => {
            if (context.num.hanime1) video.num.hanime1 = context.num.hanime1
            if (context.num.getchu) video.num.getchu = context.num.getchu
            if (context.num.dlsite) video.num.dlsite = context.num.dlsite
            return true
        },
        parseMpaa: async (video: IVideo, _context: IHanimeContext) => {
            video.mpaa = 'JP-18+'
            return true
        },
        parseRating: async (video: IVideo, context: IHanimeContext, signal: AbortSignal) => {
            // dlsite
            if (context.num.dlsite) {
                loggerDlsite.log(`搜索评分...`)

                const url = `https://www.dlsite.com/maniax/product/info/ajax?product_id=${context.num.dlsite}&cdn_cache_min=1`
                const webContent = await NetHelper.get(url, { ...dlsiteOptions, signal })
                if (signal.aborted) return false
                if (webContent.ok) {
                    const a = JSON.parse(webContent.body)[context.num.dlsite]
                    if (a) {
                        const rating = a.rate_average_2dp
                        if (rating) {
                            video.rating = (Number.parseFloat(rating) * 2).toString()
                            return true
                        }
                    }
                }

                loggerDlsite.warn(`没有找到评分`)
            } else {
                loggerDlsite.warn(`找不到dlsite页面，无法获取评分`)
            }

            return false
        },
        parseDirector: async (video: IVideo, context: IHanimeContext) => {
            // dlsite
            if (context.webContent.dlsite) {
                loggerDlsite.log(`搜索导演...`)

                const $ = cheerioLoad(context.webContent.dlsite)
                const text = $('#work_right_inner').text()

                // 匹配字段中的人名和可选职务
                interface IDlsiteStaff {
                    name: string
                    role?: string
                }

                const dlsiteStaffCategories = ['シナリオ', 'イラスト', '声優', 'その他'] as const
                const dlsiteStaffSectionEndCategories = [
                    ...dlsiteStaffCategories,
                    '年齢指定',
                    '作品形式',
                    'ジャンル'
                ]
                const dlsiteStaffRegex = /(?<name>[^/\s()]+)(?:\((?<role>[^)]+)\))?/g

                const staffs: IDlsiteStaff[] = dlsiteStaffCategories.flatMap((category) => {
                    const categoryIndex = text.indexOf(category)
                    if (categoryIndex === -1) return []

                    const peopleStartIndex = categoryIndex + category.length
                    const peopleEndIndex =
                        dlsiteStaffSectionEndCategories
                            .filter((item) => item !== category)
                            .map((item) => text.indexOf(item, peopleStartIndex))
                            .filter((index) => index !== -1)
                            .sort((a, b) => a - b)[0] ?? text.length
                    const peopleText = text.slice(peopleStartIndex, peopleEndIndex)

                    return Array.from(peopleText.matchAll(dlsiteStaffRegex)).flatMap(
                        (peopleMatch) => {
                            const name = peopleMatch.groups?.name?.trim()
                            if (!name) return []

                            const role = peopleMatch.groups?.role?.trim()
                            return [
                                {
                                    name,
                                    role: role || undefined
                                }
                            ]
                        }
                    )
                })

                const director = staffs.find((item) => {
                    const role = item.role ?? ''
                    return (
                        role === '監督' ||
                        role === '演出' ||
                        role.startsWith('監督') ||
                        role.includes('監督') ||
                        role.includes('演出')
                    )
                })

                if (director) {
                    video.director = director.name
                    return true
                }

                loggerDlsite.warn(`没有找到导演`)
            }

            // getchu
            if (context.webContent.getchu) {
                loggerGetchu.log(`搜索导演...`)

                const $ = cheerioLoad(context.webContent.getchu)
                const text = $('div#wrapper').text()

                let regex = /監督([^：]*)：\n?(?<name>[^／\n ]+)/
                let match = text.match(regex)
                if (match && match.groups) {
                    video.director = match.groups.name.trim()
                    return true
                }

                // 没有監督用制片人
                regex = /プロデューサー([^：]*)：(?<name>.*)[\n ]/
                match = text.match(regex)
                if (match && match.groups) {
                    video.director = match.groups.name
                    return true
                }

                loggerGetchu.warn(`没有找到导演`)
            }

            return false
        },
        parseActor: async (_video: IVideo, _context: IHanimeContext) => {
            return null
        },
        parseStudio: async (video: IVideo, context: IHanimeContext) => {
            const $ = cheerioLoad(context.webContent.hanime1)
            let maker = $('a#video-artist-name').text().trim()
            if (maker in maker_trans) {
                maker = maker_trans[maker]
            }

            if (!maker) return false

            video.studio = maker
            context.maker = maker
            return true
        },
        parseMaker: async (video: IVideo, context: IHanimeContext, signal: AbortSignal) => {
            if (!context.maker) {
                if (!(await hanimeScraper.scraperVideoFuncs.parseStudio(video, context, signal))) {
                    return false
                }
            }

            video.maker = context.maker
            return true
        },
        parseSet: async (video: IVideo, context: IHanimeContext) => {
            const $ = cheerioLoad(context.webContent.hanime1)
            let set = $('.single-icon-wrapper.video-playlist-top').children('h4').first().text()
            set = set.includes('/') ? set.split('/')[1].trim() : set.trim()

            if (!set) return false

            video.set = set
            return true
        },
        parseTag: async (video: IVideo, context: IHanimeContext) => {
            const $ = cheerioLoad(context.webContent.hanime1)
            const tags: string[] = ['成人动漫']
            $('.single-video-tag a').each((_, el) => {
                const text = $(el)
                    .contents()
                    .filter((_, node) => node.type === 'text')
                    .text()
                    .trim()

                if (text && text !== '中文字幕') {
                    tags.push(text)
                }
            })

            if (tags.length === 0) return false

            video.tag = tags
            context.tag = tags
            return true
        },
        parseGenre: async (video: IVideo, context: IHanimeContext, signal: AbortSignal) => {
            if (!context.tag.length) {
                if (!(await hanimeScraper.scraperVideoFuncs.parseTag(video, context, signal))) {
                    return false
                }
            }

            video.genre = context.tag
            return true
        },
        parsePlot: async (video: IVideo, context: IHanimeContext, signal: AbortSignal) => {
            let plot = (() => {
                // 先看getchu能不能获取
                if (context.webContent.getchu) {
                    const $ = cheerioLoad(context.webContent.getchu)
                    const plot = $('h3')
                        .filter((_i, el) => $(el).text().trim() === 'ストーリー') // 找到标题为"ストーリー"的元素
                        .next()
                        .find('span')
                        .clone() // 克隆，避免修改原始DOM
                        .find('.navyb') // 找到所有navyb类元素
                        .remove() // 移除它们
                        .end() // 回到克隆的span
                        .text()
                        .trim()

                    if (plot) return plot
                }

                // getchu没有的话，用dlsite
                if (context.webContent.dlsite) {
                    const $ = cheerioLoad(context.webContent.dlsite)
                    const plot = $('div')
                        .filter((_i, el) => $(el).text().trim() === '作品内容')
                        .next()
                        .text()
                        .trim()

                    if (plot) return plot
                }

                // dlsite也没有的话，用hanime
                const $ = cheerioLoad(context.webContent.hanime1)
                let plot = $('div.video-caption-text').text().trim()

                plot = plot.split('[中文字幕]')?.pop()?.split('·')?.pop() ?? ''

                return plot
            })()

            if (signal.aborted) return false

            // 翻译一下
            const re = await TransHelper.translate(plot)
            plot = re.text

            if (!plot) return false

            video.plot = plot
            return true
        },
        parseYear: async (video: IVideo, context: IHanimeContext) => {
            const $ = cheerioLoad(context.webContent.hanime1)
            const text = $('.video-description-panel').children().eq(0).text()
            const match = text.match(/\d{4}/)
            const year = match ? match[0] : ''
            if (!year) return false

            video.year = year
            return true
        },
        parsePremiered: async (video: IVideo, context: IHanimeContext) => {
            const $ = cheerioLoad(context.webContent.hanime1)
            const text = $('.video-description-panel').children().eq(0).text()
            const match = text.match(/\d{4}-\d{2}-\d{2}/)
            const premiered = match ? match[0] : ''

            if (!premiered) return false

            video.premiered = premiered
            return true
        },
        parseReleasedate: async (video: IVideo, context: IHanimeContext) => {
            const $ = cheerioLoad(context.webContent.hanime1)
            const text = $('.video-description-panel').children().eq(0).text()
            const match = text.match(/\d{4}-\d{2}-\d{2}/)
            const releasedate = match ? match[0] : ''

            if (!releasedate) return false

            video.releasedate = releasedate
            return true
        },
        parsePoster: async (video: IVideo, context: IHanimeContext, signal: AbortSignal) => {
            if (context.webContent.getchu) {
                context.封面 = await getPosterGetchu(context, signal)
            }

            // 没有则从hanime上获取
            if (!context.封面) {
                context.封面 = await getPosterHanime1(
                    video.originaltitle || video.title || video.sorttitle,
                    context,
                    signal
                )
            }

            if (!context.封面) {
                return false
            }

            video.poster = context.封面
            return true
        },
        parseThumb: async (video: IVideo, context: IHanimeContext, signal: AbortSignal) => {
            if (!video.poster) {
                if (!(await hanimeScraper.scraperVideoFuncs.parsePoster(video, context, signal))) {
                    return false
                }
            }
            const poster = video.poster
            if (!poster) return false

            if (!context.超分封面) {
                const re = await ImageHelper.superResolutionImage(poster, true)
                context.超分封面 = re ?? poster
            }

            video.thumb = context.超分封面

            return true
        },
        parseFanart: async (video: IVideo, context: IHanimeContext, signal: AbortSignal) => {
            if (!video.poster) {
                if (!(await hanimeScraper.scraperVideoFuncs.parsePoster(video, context, signal))) {
                    return false
                }
            }
            const poster = video.poster
            if (!poster) return false

            if (!context.超分封面) {
                const re = await ImageHelper.superResolutionImage(poster, true)
                context.超分封面 = re ?? poster
            }

            video.fanart = context.超分封面
            return true
        },
        parseExtrafanart: async (video: IVideo, context: IHanimeContext, signal: AbortSignal) => {
            video.extrafanart = await getExtrafanartGetchu(context, signal)
            return true
        },
        parseOutput: async (video: IVideo) => {
            const dir = `${video.set}/${video.originaltitle}`
            return { dir, fileName: video.originaltitle }
        }
    }
}

export default hanimeScraper
