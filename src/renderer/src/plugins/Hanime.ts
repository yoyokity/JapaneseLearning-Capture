import type { IScraper } from '../scraper/Scraper'
import type { IVideo } from '../scraper/Video'

import { DebugHelper, ImageHelper, NetHelper, TransHelper } from '@renderer/helper'
import { load as cheerioLoad } from 'cheerio'

/**
 * 用于对厂商进行翻译
 */
const maker_trans = {
    ピンクパイナップル: 'pinkpineapple',
    'ばにぃうぉ〜か〜': 'lune-soft',
    'ばにぃうぉ～か～': 'lune-soft',
    あんてきぬすっ: 'lune-soft',
    'じゅうしぃまんご〜': 'lune-soft',
    ショーテン: 'showten',
    'メリー・ジェーン': 'mary-jane',
    'ZIZ [ジズ]': 'ZIZ'
}

const getchuOptions = {
    headers: { referer: 'https://www.getchu.com' },
    cookie: { getchu_adalt_flag: 'https://www.getchu.com' }
}

let temp = {
    封面: null as ArrayBuffer | null,
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
    tag: [] as string[]
}

/**
 * 解析视频编号到 temp.num
 * @param video 视频信息，num 格式如 "hanime1-15678,getchu-54400,dlsite-VJ013217"
 */
function parseNum(video: IVideo): void {
    temp.num = { hanime1: '', getchu: '', dlsite: '' }

    if (!video.num) {
        return
    }

    const regex = /(?<key>hanime1|getchu|dlsite)-(?<value>[^,]+)/gi
    for (const match of video.num.matchAll(regex)) {
        const { key, value } = match.groups!
        temp.num[key.toLowerCase() as keyof typeof temp.num] = value
    }
}

async function searchVideoHanime1(
    originaltitle: string
): Promise<{ href: string; poster: string | undefined } | null> {
    const url = `https://hanime1.me/search?query=${encodeURIComponent(originaltitle)}&genre=${encodeURIComponent('裏番')}`
    const webContent = await NetHelper.get(url)
    if (!webContent.ok) {
        DebugHelper.warn(`- [Hanime1] 获取搜索结果失败`)
        return null
    }

    const $ = cheerioLoad(webContent.body)
    const videoList = $('.home-rows-videos-wrapper > a').filter(
        '[href^="https://hanime1.me/watch?v="]'
    )

    DebugHelper.log(`- [Hanime1] 搜索到${videoList.length}个番剧作为候选项`)
    videoList.each((_, el) => DebugHelper.log(`- [Hanime1] 【${$(el).text().trim().trim()}】`))

    const firstVideo = videoList.first()
    const href = firstVideo.attr('href')
    if (!href) {
        DebugHelper.warn(`- [Hanime1] 没有找到匹配的番剧`)
        return null
    }

    const poster = firstVideo.find('img').attr('src')
    DebugHelper.log(`- [Hanime1] 找到匹配的番剧：【${firstVideo.text().trim()}】 ${href}`)
    return { href, poster }
}

/**
 * Hanime1
 */
async function getWebContentHanime1(video: IVideo): Promise<string | null> {
    DebugHelper.log(`- [Hanime1] 开始获取网页内容`)

    //先使用编号搜索
    if (temp.num.hanime1) {
        const url = `https://hanime1.me/watch?v=${temp.num.hanime1}`
        DebugHelper.log(`- [Hanime1] 使用编号搜索：${temp.num.hanime1}`)

        const webContent = await NetHelper.get(url)
        if (webContent.ok) {
            DebugHelper.info(`- [Hanime1] 获取到网页内容`)
            return webContent.body
        }
        DebugHelper.log(`- [Hanime1] 使用编号搜索失败，使用原标题搜索`)
    }

    //如果编号搜索失败，则使用原标题搜索
    const searchResult = await searchVideoHanime1(video.originaltitle)
    if (!searchResult) {
        DebugHelper.warn(`- [Hanime1] 获取网页内容失败`)
        return null
    }

    if (searchResult.poster) {
        const re = await NetHelper.getImage(searchResult.poster)
        if (re.ok) {
            temp.封面 = re.body
        }
    }

    //获取目标视频的webContent
    const webContent = await NetHelper.get(searchResult.href)
    if (!webContent.ok) {
        DebugHelper.warn(`- [Hanime1] 获取网页内容失败`)
        return null
    }

    //记录num
    temp.num.hanime1 = searchResult.href.split('watch?v=')[1]

    DebugHelper.info(`- [Hanime1] 获取到网页内容`)
    return webContent.body
}

/**
 * Getchu
 */
async function getWebContentGetchu(video: IVideo): Promise<string | null> {
    DebugHelper.log(`- [Getchu] 开始获取网页内容`)

    /**
     * 解码 EUC-JP 编码的 ArrayBuffer
     */
    function decodeEucJp(buffer: ArrayBuffer): string {
        return new TextDecoder('EUC-JP').decode(new Uint8Array(buffer))
    }

    /**
     * 获取 Getchu 页面内容
     */
    async function fetchPage(url: string): Promise<string | null> {
        const res = await NetHelper.get(url, { ...getchuOptions, parse: 'arrayBuffer' })
        if (!res.ok) {
            return null
        }
        return decodeEucJp(res.body)
    }

    //先使用编号搜索
    if (temp.num.getchu) {
        const url = `https://www.getchu.com/soft.phtml?id=${temp.num.getchu}&gc=gc`
        DebugHelper.log(`- [Getchu] 使用编号搜索：${temp.num.getchu}`)

        const body = await fetchPage(url)
        if (body) {
            DebugHelper.info(`- [Getchu] 获取到网页内容`)
            return body
        }
        DebugHelper.log(`- [Getchu] 使用编号搜索失败，使用原标题搜索`)
    }

    //如果编号搜索失败，则使用原标题搜索
    const searchUrl = `https://www.getchu.com/php/search.phtml?aurl=https://www.getchu.com/php/search.phtml&genre=anime_dvd&search_keyword=${encodeURIComponent(video.originaltitle)}&check_key_dtl=1&submit=&gc=gc`
    const searchBody = await fetchPage(searchUrl)
    if (!searchBody) {
        DebugHelper.warn(`- [Getchu] 获取搜索结果失败`)
        return null
    }

    //在视频列表中找到符合条件的第一个
    const $ = cheerioLoad(searchBody)
    const videoList = $('td > a.blueb[href*="/soft.phtml?id="]')

    DebugHelper.log(`- [Getchu] 搜索到${videoList.length}个番剧作为候选项：`)
    videoList.each((_, el) => DebugHelper.log(`- [Getchu] 【${$(el).text().trim()}】`))

    const target = videoList
        .filter((_, el) => $(el).text().trim().includes(video.originaltitle))
        .first()
    const href = target.attr('href')
    if (!href) {
        DebugHelper.warn(`- [Getchu] 没有找到匹配的番剧`)
        return null
    }
    DebugHelper.log(`- [Getchu] 找到匹配的番剧：【${target.text().trim()}】 ${href}`)

    //根据href获取webContent
    const fullUrl = NetHelper.joinUrl('https://www.getchu.com/', href)
    const body = await fetchPage(fullUrl)
    if (!body) {
        DebugHelper.warn(`- [Getchu] 获取网页内容失败`)
        return null
    }

    //记录num
    temp.num.getchu = fullUrl.split('?id=')[1]

    DebugHelper.info(`- [Getchu] 获取到网页内容`)
    return body
}

const dlsiteOptions = {
    headers: {
        'Upgrade-Insecure-Requests': '1',
        referer: 'https://www.dlsite.com'
    },
    cookie: { adultchecked: '1' }
}

/**
 * Dlsite
 */
async function getWebContentDlsite(video: IVideo): Promise<string | null> {
    DebugHelper.log(`- [Dlsite] 开始获取网页内容`)

    //先使用编号搜索
    if (temp.num.dlsite) {
        const url = `https://www.dlsite.com/pro/work/=/product_id/${temp.num.dlsite}.html?locale=ja_JP`

        DebugHelper.log(`- [Dlsite] 使用编号搜索：${url}`)
        const webContent = await NetHelper.get(url, dlsiteOptions)
        if (webContent.ok) {
            DebugHelper.info(`- [Dlsite] 获取到网页内容`)
            return webContent.body
        }

        DebugHelper.log(`- [Dlsite] 使用编号搜索失败，使用原标题搜索`)
    }

    //如果编号搜索失败，则使用原标题搜索
    const searchUrl = `https://www.dlsite.com/maniax/fsr/=/keyword/${encodeURIComponent(video.originaltitle)}/order/trend/work_type_category[0]/movie`
    const webContent = await NetHelper.get(searchUrl, dlsiteOptions)
    if (!webContent.ok) {
        DebugHelper.warn(`- [Dlsite] 获取搜索结果失败`)
        return null
    }

    //在视频列表中找到符合条件的第一个
    const $ = cheerioLoad(webContent.body)
    const videoList = $('ul#search_result_img_box > li .multiline_truncate a')

    DebugHelper.log(`- [Dlsite] 搜索到${videoList.length}个番剧作为候选项：`)
    videoList.each((_, el) => DebugHelper.log(`- [Dlsite] 【${$(el).text().trim()}】`))

    const target = videoList
        .filter((_, el) => $(el).text().trim().includes(video.originaltitle))
        .first()
    const href = target.attr('href')
    if (!href) {
        DebugHelper.warn(`- [Dlsite] 没有找到匹配的番剧`)
        return null
    }
    DebugHelper.log(`- [Dlsite] 找到匹配的番剧：【${target.text().trim()}】 ${href}`)

    //根据href获取webContent
    const body = await NetHelper.get(href, dlsiteOptions)
    if (!body.ok) {
        DebugHelper.warn(`- [Dlsite] 获取网页内容失败`)
        return null
    }

    //记录num
    temp.num.dlsite = href.split('/product_id/')[1].split('.')[0]

    DebugHelper.info(`- [Dlsite] 获取到网页内容`)
    return body.body
}

const hanimeScraper: IScraper = {
    scraperName: '里番',
    checkConnect: async () => {
        return true
    },
    scraperVideoFuncs: {
        getWebContent: async (video: IVideo) => {
            temp = {
                封面: null,
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
            }

            parseNum(video)

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
            let num = ''
            if (temp.num.hanime1) num = `${num}hanime1-${temp.num.hanime1}`
            if (temp.num.getchu) num = `${num},getchu-${temp.num.getchu}`
            if (temp.num.dlsite) num = `${num},dlsite-${temp.num.dlsite}`

            if (!num) return null

            video.num = num
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
            else if (temp.webContent.getchu) {
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
            set = set.split('/')[1].trim()

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
            plot = plot.split('[中文字幕]')[1].trim()

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
            if (temp.webContent.getchu) {
                //先从getchu上获取封面
                const $ = cheerioLoad(temp.webContent.getchu)
                const url = $('table#soft_table')
                    .find('a')
                    .first()
                    .attr('href')
                    ?.replace(/^\.\/ */, '')

                if (url) {
                    const posterUrl = NetHelper.joinUrl('https://www.getchu.com/', url)
                    const re = await NetHelper.getImage(posterUrl, getchuOptions)

                    if (re.ok) {
                        temp.封面 = re.body
                        DebugHelper.log(`- [Getchu] 获取封面成功！:${posterUrl}`)
                    }
                }
            }

            //没有则从hanime上获取
            if (!temp.封面) {
                //在搜索页面中获取封面
                const searchResult = await searchVideoHanime1(video.originaltitle)
                if (!searchResult || !searchResult.poster) {
                    return null
                }

                const re = await NetHelper.getImage(searchResult.poster)
                if (re.ok) {
                    temp.封面 = re.body
                }
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

            const re = await ImageHelper.superResolutionImage(video.poster!, true)
            video.thumb = re ?? video.poster

            return video
        },
        parseFanart: async (video: IVideo, webContent: string) => {
            if (!video.thumb) {
                if (!(await hanimeScraper.scraperVideoFuncs.parseThumb(video, webContent)))
                    return null
            }

            video.fanart = video.thumb
            return video
        },
        parseExtrafanart: async (video: IVideo) => {
            //getchu
            if (temp.webContent.getchu) {
                const $ = cheerioLoad(temp.webContent.getchu)
                const targetElement = $('div.tabletitle').filter(function () {
                    return $(this).text().includes('サンプル画像')
                })
                const hrefs = targetElement
                    .next()
                    .find('a')
                    .map((_, el) =>
                        $(el)
                            .attr('href')
                            ?.replace(/^\.\/ */, '')
                    )

                const urls = hrefs
                    .toArray()
                    .map((href) => NetHelper.joinUrl('https://www.getchu.com/', href!))

                // 按顺序获取每个图片，保持顺序一致
                video.extrafanart = []
                for (const url of urls) {
                    const re = await NetHelper.getImage(url, getchuOptions)
                    if (re.ok) {
                        DebugHelper.log(`- [Getchu] 获取剧照成功！:${url}`)
                        video.extrafanart.push(re.body)
                    } else {
                        DebugHelper.warn(`- [Getchu] 获取剧照失败！:${url}`)
                    }
                }
            } else {
                DebugHelper.log(`- 没有getchu，无法获取剧照`)
            }
            return video
        },
        parseOutput: async (video: IVideo) => {
            const dir = `${video.set}/${video.originaltitle}`
            return { dir, fileName: video.originaltitle }
        }
    }
}

export default hanimeScraper
