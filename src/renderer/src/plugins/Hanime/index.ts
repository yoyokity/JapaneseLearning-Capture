import type { IScraper, IVideo } from '@renderer/scraper'

import { DebugHelper, ImageHelper, NetHelper, TransHelper } from '@renderer/helper'
import { load as cheerioLoad } from 'cheerio'

import { dlsiteOptions, getWebContentDlsite } from './Dlsite'
import { getExtrafanartGetchu, getPosterGetchu, getWebContentGetchu } from './Getchu'
import { getPosterHanime1, getWebContentHanime1 } from './Hanime1'
import { maker_trans } from './makerTrans'
import { temp } from './temp'

const hanimeScraper: IScraper = {
    scraperName: '里番',
    checkConnect: async () => {
        return true
    },
    numSource: {
        hanime1: 'https://hanime1.me/watch?v={num}',
        getchu: 'https://www.getchu.com/soft.phtml?id={num}&gc=gc',
        dlsite: 'https://www.dlsite.com/pro/work/=/product_id/{num}.html?locale=ja_JP'
    },
    scraperVideoFuncs: {
        getWebContent: async (video: IVideo) => {
            temp.封面 = null
            temp.超分封面 = null
            temp.num.hanime1 = ''
            temp.num.getchu = ''
            temp.num.dlsite = ''
            temp.webContent.hanime1 = ''
            temp.webContent.getchu = ''
            temp.webContent.dlsite = ''
            temp.originaltitle = ''
            temp.maker = ''
            temp.tag = []

            //获取webContent
            const [hanime1, getchu, dlsite] = await Promise.all([
                getWebContentHanime1(video),
                getWebContentGetchu(video),
                getWebContentDlsite(video)
            ])

            temp.webContent.hanime1 = hanime1 ?? ''
            temp.webContent.getchu = getchu ?? ''
            temp.webContent.dlsite = dlsite ?? ''

            return temp.webContent.hanime1 || null
        },
        parseTitle: async (video: IVideo, webContent: string) => {
            const $ = cheerioLoad(webContent)
            let title = $('.video-description-panel').children().eq(1).text()
            title = TransHelper.translateSC(title.trim())

            if (!title) return null

            video.title = title
            return video
        },
        parseOriginaltitle: async (video: IVideo, webContent: string) => {
            const $ = cheerioLoad(webContent)
            let originaltitle = $('h3#shareBtn-title').text()
            originaltitle = originaltitle.split('[中文字幕]')[0].trim()

            if (!originaltitle) return null

            video.originaltitle = originaltitle
            temp.originaltitle = video.originaltitle
            return video
        },
        parseSorttitle: async (video: IVideo, webContent: string) => {
            if (!temp.originaltitle) {
                if (!(await hanimeScraper.scraperVideoFuncs.parseOriginaltitle(video, webContent)))
                    return null
            }

            video.sorttitle = temp.originaltitle
            return video
        },
        parseTagline: async (video: IVideo) => {
            return video
        },
        parseNum: async (video: IVideo) => {
            if (temp.num.hanime1) video.num.hanime1 = temp.num.hanime1
            if (temp.num.getchu) video.num.getchu = temp.num.getchu
            if (temp.num.dlsite) video.num.dlsite = temp.num.dlsite
            return video
        },
        parseMpaa: async (video: IVideo) => {
            video.mpaa = 'JP-18+'
            return video
        },
        parseRating: async (video: IVideo) => {
            //dlsite
            if (temp.num.dlsite) {
                const url = `https://www.dlsite.com/maniax/product/info/ajax?product_id=${temp.num.dlsite}&cdn_cache_min=1`
                DebugHelper.log(`- [Dlsite] 搜索评分...`)
                const webContent = await NetHelper.get(url, dlsiteOptions)
                if (webContent.ok) {
                    const a = JSON.parse(webContent.body)[temp.num.dlsite]
                    if (a) {
                        const rating = a.rate_average_2dp
                        if (rating) {
                            video.rating = (Number.parseFloat(rating) * 2).toString()
                            return video
                        }
                    }
                }

                DebugHelper.warn(`- [Dlsite] 没有找到评分`)
            } else {
                DebugHelper.warn(`- 没有dlsite，无法获取评分`)
            }

            return video
        },
        parseDirector: async (video: IVideo) => {
            //dlsite
            if (temp.webContent.dlsite) {
                DebugHelper.log(`- [Dlsite] 搜索导演...`)
                const $ = cheerioLoad(temp.webContent.dlsite)
                const text = $('#work_right_inner').text()

                const ROLE_PRIORITY = ['監督', '演出', '脚本']
                const ROLE_REGEX_TEMPLATE = /([^\s（]+?)\s*[（(]\{\{role\}\}/

                for (const role of ROLE_PRIORITY) {
                    const dynamicRegex = new RegExp(
                        ROLE_REGEX_TEMPLATE.source.replace('{{role}}', role)
                    )
                    const match = text.match(dynamicRegex)
                    if (match) {
                        video.director = match[1].trim()
                        return video
                    }
                }

                DebugHelper.warn(`- [Dlsite] 没有找到导演`)
            }

            //getchu
            if (temp.webContent.getchu) {
                DebugHelper.log(`- [Getchu] 搜索导演...`)
                const $ = cheerioLoad(temp.webContent.getchu)
                const text = $('div#wrapper').text()

                let regex = /監督([^：]*)：\n?(?<name>[^／\n ]+)/
                let match = text.match(regex)
                if (match && match.groups) {
                    video.director = match.groups.name.trim()
                    return video
                }

                //没有監督用制片人
                regex = /プロデューサー([^：]*)：(?<name>.*)[\n ]/
                match = text.match(regex)
                if (match && match.groups) {
                    video.director = match.groups.name
                    return video
                }

                DebugHelper.warn(`- [Getchu] 没有找到导演`)
            }

            return video
        },
        parseActor: async (video: IVideo) => {
            return video
        },
        parseStudio: async (video: IVideo, webContent: string) => {
            const $ = cheerioLoad(webContent)
            let maker = $('a#video-artist-name').text().trim()
            if (maker in maker_trans) {
                maker = maker_trans[maker]
            }

            if (!maker) return null

            video.studio = maker
            temp.maker = maker
            return video
        },
        parseMaker: async (video: IVideo, webContent: string) => {
            if (!temp.maker) {
                if (!(await hanimeScraper.scraperVideoFuncs.parseStudio(video, webContent)))
                    return null
            }

            video.maker = temp.maker
            return video
        },
        parseSet: async (video: IVideo, webContent: string) => {
            const $ = cheerioLoad(webContent)
            let set = $('.single-icon-wrapper.video-playlist-top').children('h4').first().text()
            set = set.includes('/') ? set.split('/')[1].trim() : set.trim()

            if (!set) return null

            video.set = set
            return video
        },
        parseTag: async (video: IVideo, webContent: string) => {
            const $ = cheerioLoad(webContent)
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

            if (tags.length === 0) return null

            video.tag = tags
            temp.tag = tags
            return video
        },
        parseGenre: async (video: IVideo, webContent: string) => {
            if (!temp.tag) {
                if (!(await hanimeScraper.scraperVideoFuncs.parseTag(video, webContent)))
                    return null
            }

            video.genre = temp.tag
            return video
        },
        parsePlot: async (video: IVideo, webContent: string) => {
            const $ = cheerioLoad(webContent)
            let plot = $('div.video-caption-text').text()

            if (plot.includes('[中文字幕]')) {
                plot = plot.split('[中文字幕]')[1].trim()
            }

            //翻译一下
            const re = await TransHelper.translate(plot)
            if (re.ok) {
                plot = re.text.trim()
            }

            if (!plot) return null

            video.plot = plot
            return video
        },
        parseYear: async (video: IVideo, webContent: string) => {
            const $ = cheerioLoad(webContent)
            const text = $('.video-description-panel').children().eq(0).text()
            const match = text.match(/\d{4}/)
            const year = match ? match[0] : ''
            if (!year) return null

            video.year = year
            return video
        },
        parsePremiered: async (video: IVideo, webContent: string) => {
            const $ = cheerioLoad(webContent)
            const text = $('.video-description-panel').children().eq(0).text()
            const match = text.match(/\d{4}-\d{2}-\d{2}/)
            const premiered = match ? match[0] : ''

            if (!premiered) return null

            video.premiered = premiered
            return video
        },
        parseReleasedate: async (video: IVideo, webContent: string) => {
            const $ = cheerioLoad(webContent)
            const text = $('.video-description-panel').children().eq(0).text()
            const match = text.match(/\d{4}-\d{2}-\d{2}/)
            const releasedate = match ? match[0] : ''

            if (!releasedate) return null

            video.releasedate = releasedate
            return video
        },
        parsePoster: async (video: IVideo) => {
            if (temp.webContent.getchu) temp.封面 = await getPosterGetchu()

            //没有则从hanime上获取
            if (!temp.封面) {
                temp.封面 = await getPosterHanime1(video.originaltitle)
            }

            if (!temp.封面) {
                return null
            }

            video.poster = temp.封面
            return video
        },
        parseThumb: async (video: IVideo, webContent: string) => {
            if (!video.poster) {
                if (!(await hanimeScraper.scraperVideoFuncs.parsePoster(video, webContent)))
                    return null
            }
            const poster = video.poster
            if (!poster) return null

            if (!temp.超分封面) {
                const re = await ImageHelper.superResolutionImage(poster, true)
                temp.超分封面 = re ?? poster
            }

            video.thumb = temp.超分封面

            return video
        },
        parseFanart: async (video: IVideo, webContent: string) => {
            if (!video.poster) {
                if (!(await hanimeScraper.scraperVideoFuncs.parsePoster(video, webContent)))
                    return null
            }
            const poster = video.poster
            if (!poster) return null

            if (!temp.超分封面) {
                const re = await ImageHelper.superResolutionImage(poster, true)
                temp.超分封面 = re ?? poster
            }

            video.fanart = temp.超分封面
            return video
        },
        parseExtrafanart: async (video: IVideo) => {
            video.extrafanart = await getExtrafanartGetchu()
            return video
        },
        parseOutput: async (video: IVideo) => {
            const dir = `${video.set}/${video.originaltitle}`
            return { dir, fileName: video.originaltitle }
        }
    }
}

export default hanimeScraper
