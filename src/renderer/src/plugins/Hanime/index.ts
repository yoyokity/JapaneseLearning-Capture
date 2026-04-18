import type { IScraper, IVideo } from '@renderer/scraper'
import type { IHanimeContent } from './temp'

import { EncodeHelper, ImageHelper, LogHelper, NetHelper, TransHelper } from '@renderer/helper'
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

const hanimeScraper: IScraper<IHanimeContent> = {
    scraperName,
    checkConnect: async () => {
        return true
    },
    numSource: {
        hanime1: 'https://hanime1.me/watch?v={num}',
        getchu: 'https://www.getchu.com/soft.phtml?id={num}&gc=gc',
        dlsite: 'https://www.dlsite.com/pro/work/=/product_id/{num}.html?locale=ja_JP'
    },
    createContent: () => ({
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
        getWebContent: async (video: IVideo, content: IHanimeContent) => {
            if (content.webContent.hanime1) {
                LogHelper.title(scraperName).log('网页内容已获取过，跳过')
                return true
            }

            const searchTitle = video.originaltitle || video.title || video.sorttitle
            content.num.hanime1 = video.num.hanime1 ?? ''
            content.num.getchu = video.num.getchu ?? ''
            content.num.dlsite = video.num.dlsite ?? ''

            //获取webContent
            await Promise.all([
                getWebContentHanime1(searchTitle, content),
                getWebContentGetchu(searchTitle, content),
                getWebContentDlsite(searchTitle, content)
            ])

            return Boolean(content.webContent.hanime1)
        },
        parseTitle: async (video: IVideo, content: IHanimeContent) => {
            const $ = cheerioLoad(content.webContent.hanime1)
            let title = $('.video-description-panel').children().eq(1).text()
            title = TransHelper.translateSC(title.trim())

            if (!title) return false

            video.title = title
            return true
        },
        parseOriginaltitle: async (video: IVideo, content: IHanimeContent) => {
            const $ = cheerioLoad(content.webContent.hanime1)
            let originaltitle = $('h3#shareBtn-title').text()
            originaltitle = originaltitle.split('[中文字幕]')[0].trim()

            if (!originaltitle) return false

            video.originaltitle = originaltitle
            content.originaltitle = video.originaltitle
            return true
        },
        parseSorttitle: async (video: IVideo, content: IHanimeContent) => {
            if (!content.originaltitle) {
                if (!(await hanimeScraper.scraperVideoFuncs.parseOriginaltitle(video, content))) {
                    return false
                }
            }

            video.sorttitle = content.originaltitle
            return true
        },
        parseTagline: async (_video: IVideo, _content: IHanimeContent) => {
            return true
        },
        parseNum: async (video: IVideo, content: IHanimeContent) => {
            if (content.num.hanime1) video.num.hanime1 = content.num.hanime1
            if (content.num.getchu) video.num.getchu = content.num.getchu
            if (content.num.dlsite) video.num.dlsite = content.num.dlsite
            return true
        },
        parseMpaa: async (video: IVideo, _content: IHanimeContent) => {
            video.mpaa = 'JP-18+'
            return true
        },
        parseRating: async (video: IVideo, content: IHanimeContent) => {
            //dlsite
            if (content.num.dlsite) {
                loggerDlsite.log(`搜索评分...`)

                const url = `https://www.dlsite.com/maniax/product/info/ajax?product_id=${content.num.dlsite}&cdn_cache_min=1`
                const webContent = await NetHelper.get(url, dlsiteOptions)
                if (webContent.ok) {
                    const a = JSON.parse(webContent.body)[content.num.dlsite]
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
        parseDirector: async (video: IVideo, content: IHanimeContent) => {
            //dlsite
            if (content.webContent.dlsite) {
                loggerDlsite.log(`搜索导演...`)

                const $ = cheerioLoad(content.webContent.dlsite)
                const text = $('#work_right_inner').text()

                const ROLE_PRIORITY = ['監督', '演出', '脚本']
                const ROLE_REGEX_TEMPLATE = /(?<name>[^\s（]+?)\s*[（(]\{\{role\}\}/

                for (const role of ROLE_PRIORITY) {
                    const dynamicRegex = new RegExp(
                        ROLE_REGEX_TEMPLATE.source.replace('{{role}}', role)
                    )
                    const match = text.match(dynamicRegex)
                    if (match?.groups?.name) {
                        video.director = match.groups.name.trim()
                        return true
                    }
                }

                loggerDlsite.warn(`没有找到导演`)
            }

            //getchu
            if (content.webContent.getchu) {
                loggerGetchu.log(`搜索导演...`)

                const $ = cheerioLoad(content.webContent.getchu)
                const text = $('div#wrapper').text()

                let regex = /監督([^：]*)：\n?(?<name>[^／\n ]+)/
                let match = text.match(regex)
                if (match && match.groups) {
                    video.director = match.groups.name.trim()
                    return true
                }

                //没有監督用制片人
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
        parseActor: async (_video: IVideo, _content: IHanimeContent) => {
            return true
        },
        parseStudio: async (video: IVideo, content: IHanimeContent) => {
            const $ = cheerioLoad(content.webContent.hanime1)
            let maker = $('a#video-artist-name').text().trim()
            if (maker in maker_trans) {
                maker = maker_trans[maker]
            }

            if (!maker) return false

            video.studio = maker
            content.maker = maker
            return true
        },
        parseMaker: async (video: IVideo, content: IHanimeContent) => {
            if (!content.maker) {
                if (!(await hanimeScraper.scraperVideoFuncs.parseStudio(video, content))) {
                    return false
                }
            }

            video.maker = content.maker
            return true
        },
        parseSet: async (video: IVideo, content: IHanimeContent) => {
            const $ = cheerioLoad(content.webContent.hanime1)
            let set = $('.single-icon-wrapper.video-playlist-top').children('h4').first().text()
            set = set.includes('/') ? set.split('/')[1].trim() : set.trim()

            if (!set) return false

            video.set = set
            return true
        },
        parseTag: async (video: IVideo, content: IHanimeContent) => {
            const $ = cheerioLoad(content.webContent.hanime1)
            const tags: string[] = ['成人动漫']
            $('.single-video-tag a').each((_, el) => {
                const text = $(el)
                    .contents()
                    .filter((_, node) => node.type === 'text')
                    .text()
                    .trim()
                if (text) {
                    tags.push(text)
                }
            })

            if (tags.length === 0) return false

            video.tag = tags
            content.tag = tags
            return true
        },
        parseGenre: async (video: IVideo, content: IHanimeContent) => {
            if (!content.tag.length) {
                if (!(await hanimeScraper.scraperVideoFuncs.parseTag(video, content))) {
                    return false
                }
            }

            video.genre = content.tag
            return true
        },
        parsePlot: async (video: IVideo, content: IHanimeContent) => {
            const $ = cheerioLoad(content.webContent.hanime1)
            let plot = $('div.video-caption-text').text()

            if (plot.includes('[中文字幕]')) {
                plot = plot.split('[中文字幕]')[1].trim()
            }

            //翻译一下
            const re = await TransHelper.translate(plot)
            if (re.ok) {
                plot = TransHelper.translateSC(re.text.trim())
                plot = EncodeHelper.normalizePlotLineBreak(plot)
            }

            if (!plot) return false

            video.plot = plot
            return true
        },
        parseYear: async (video: IVideo, content: IHanimeContent) => {
            const $ = cheerioLoad(content.webContent.hanime1)
            const text = $('.video-description-panel').children().eq(0).text()
            const match = text.match(/\d{4}/)
            const year = match ? match[0] : ''
            if (!year) return false

            video.year = year
            return true
        },
        parsePremiered: async (video: IVideo, content: IHanimeContent) => {
            const $ = cheerioLoad(content.webContent.hanime1)
            const text = $('.video-description-panel').children().eq(0).text()
            const match = text.match(/\d{4}-\d{2}-\d{2}/)
            const premiered = match ? match[0] : ''

            if (!premiered) return false

            video.premiered = premiered
            return true
        },
        parseReleasedate: async (video: IVideo, content: IHanimeContent) => {
            const $ = cheerioLoad(content.webContent.hanime1)
            const text = $('.video-description-panel').children().eq(0).text()
            const match = text.match(/\d{4}-\d{2}-\d{2}/)
            const releasedate = match ? match[0] : ''

            if (!releasedate) return false

            video.releasedate = releasedate
            return true
        },
        parsePoster: async (video: IVideo, content: IHanimeContent) => {
            if (content.webContent.getchu) {
                content.封面 = await getPosterGetchu(content)
            }

            //没有则从hanime上获取
            if (!content.封面) {
                content.封面 = await getPosterHanime1(
                    video.originaltitle || video.title || video.sorttitle,
                    content
                )
            }

            if (!content.封面) {
                return false
            }

            video.poster = content.封面
            return true
        },
        parseThumb: async (video: IVideo, content: IHanimeContent) => {
            if (!video.poster) {
                if (!(await hanimeScraper.scraperVideoFuncs.parsePoster(video, content))) {
                    return false
                }
            }
            const poster = video.poster
            if (!poster) return false

            if (!content.超分封面) {
                const re = await ImageHelper.superResolutionImage(poster, true)
                content.超分封面 = re ?? poster
            }

            video.thumb = content.超分封面

            return true
        },
        parseFanart: async (video: IVideo, content: IHanimeContent) => {
            if (!video.poster) {
                if (!(await hanimeScraper.scraperVideoFuncs.parsePoster(video, content))) {
                    return false
                }
            }
            const poster = video.poster
            if (!poster) return false

            if (!content.超分封面) {
                const re = await ImageHelper.superResolutionImage(poster, true)
                content.超分封面 = re ?? poster
            }

            video.fanart = content.超分封面
            return true
        },
        parseExtrafanart: async (video: IVideo, _content: IHanimeContent) => {
            video.extrafanart = await getExtrafanartGetchu(_content)
            return true
        },
        parseOutput: async (video: IVideo, _content: IHanimeContent) => {
            const dir = `${video.set}/${video.originaltitle}`
            return { dir, fileName: video.originaltitle }
        }
    }
}

export default hanimeScraper
