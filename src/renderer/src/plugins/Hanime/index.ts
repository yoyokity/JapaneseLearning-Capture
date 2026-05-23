import {
    DebugHelper,
    MediaHelper,
    NetHelper,
    posterScale,
    ScraperHelper,
    StringHelper,
    thumbScale,
    TransHelper
} from '@renderer/helper'
import { load as cheerioLoad } from 'cheerio'
import { toNumber } from 'es-toolkit/compat'

import {
    bannedWord,
    loggerDlsite,
    loggerFanza,
    loggerGetchu,
    loggerHanime1,
    maker_trans,
    scraperName
} from './type'

const dlsiteOptions = {
    headers: {
        'Upgrade-Insecure-Requests': '1',
        referer: 'https://www.dlsite.com'
    }
}

const fanzaOptions = {
    headers: {
        referer: 'https://www.dmm.co.jp/'
    }
}

const getchuOptions = {
    headers: { referer: 'https://www.getchu.com' }
}

// #region 设置cookie
NetHelper.setCookie({
    url: 'https://www.dlsite.com/',
    domain: 'dlsite.com',
    value: { adultchecked: '1' }
})

NetHelper.setCookie({
    url: 'https://www.dmm.co.jp/',
    domain: 'dmm.co.jp',
    value: { age_check_done: '1', ckcy: '1' }
})

NetHelper.setCookie({
    url: 'https://www.getchu.com/',
    domain: 'getchu.com',
    value: { _gat: '1', getchu_adalt_flag: 'getchu.com' }
})
// #endregion

const useScraper = ScraperHelper.defineScraper(
    scraperName,
    {
        hanime1: 'https://hanime1.me/watch?v={num}',
        getchu: 'https://www.getchu.com/soft.phtml?id={num}&gc=gc',
        dlsite: 'https://www.dlsite.com/pro/work/=/product_id/{num}.html?locale=ja_JP',
        fanza: 'https://www.dmm.co.jp/mono/anime/-/detail/=/cid={num}/'
    },
    (video, signal: AbortSignal) => {
        // #region temp变量
        const Hanime1SearchResult = {
            searched: false,
            result: null as { href: string; poster: string | undefined } | null
        }

        const num = {
            hanime1: '',
            getchu: '',
            dlsite: '',
            fanza: ''
        }

        const webContent = {
            hanime1: '',
            getchu: '',
            dlsite: '',
            fanza: ''
        }

        let tag: string[] = []

        let posterUrl = ''
        // #endregion temp变量

        // #region Hanime1网页内容获取
        async function searchVideoHanime1(searchTitle: string) {
            if (Hanime1SearchResult.searched) return Hanime1SearchResult.result

            const result = await (async () => {
                const url = `https://hanime1.me/search?query=${StringHelper.encodeUrl(
                    StringHelper.punctuationsToSpace(searchTitle)
                )}&genre=${StringHelper.encodeUrl('裏番')}`

                const res = await NetHelper.get(url, { signal })
                if (!res.ok) {
                    loggerHanime1.warn(`获取搜索结果失败`, url)
                    return null
                }

                const $ = cheerioLoad(res.body)
                const videoList = $('.home-rows-videos-wrapper > a')
                    .filter('[href^="https://hanime1.me/watch?v="]')
                    .toArray()
                    .map((el) => {
                        const item = $(el)
                        return {
                            href: item.attr('href')?.trim(),
                            title: item.find('div.home-rows-videos-title').text().trim(),
                            poster: item.find('img').attr('src')
                        }
                    })
                    .filter(
                        (
                            item
                        ): item is { href: string; title: string; poster: string | undefined } =>
                            !!item.href && !!item.title && !!item.poster
                    )

                loggerHanime1.log(
                    `搜索到${videoList.length}个番剧作为候选项：`,
                    url,
                    videoList.map((item) => item.title)
                )

                const targetVideo = videoList[0]
                loggerHanime1.log(`选择第 1 个视频: 【${targetVideo.title}】`, targetVideo.href)

                return { href: targetVideo.href, poster: targetVideo.poster }
            })()

            Hanime1SearchResult.searched = true
            Hanime1SearchResult.result = result
            return result
        }

        async function getWebContentHanime1(searchTitle: string): Promise<void> {
            loggerHanime1.log(`开始获取网页内容`)

            // 先使用编号搜索
            if (num.hanime1) {
                const url = `https://hanime1.me/watch?v=${num.hanime1}`
                loggerHanime1.log(`使用编号搜索：${num.hanime1}`)

                const res = await NetHelper.get(url, { signal })
                if (signal.aborted) return
                if (res.ok) {
                    webContent.hanime1 = res.body
                    loggerHanime1.success(`获取到网页内容`)
                    return
                }
                loggerHanime1.log(`使用编号搜索失败，使用原标题搜索`, url)
            }

            // 如果编号搜索失败，则使用原标题搜索
            const searchResult = await searchVideoHanime1(searchTitle)
            if (!searchResult) {
                loggerHanime1.warn(`获取网页内容失败`)
                return
            }

            // 获取目标视频的webContent
            const res = await NetHelper.get(searchResult.href, { signal })
            if (!res.ok) {
                loggerHanime1.warn(`获取网页内容失败`)
                return
            }

            // 记录num
            num.hanime1 = searchResult.href.split('watch?v=')[1]
            webContent.hanime1 = res.body

            loggerHanime1.success(`获取到网页内容`)
        }

        async function getPosterHanime1(searchTitle: string): Promise<string | null> {
            const searchResult = await searchVideoHanime1(searchTitle)
            const posterUrl = searchResult?.poster

            return posterUrl || null
        }
        // #endregion Hanime1网页内容获取

        // #region Getchu网页内容获取
        async function getWebContentGetchu(searchTitle: string): Promise<void> {
            loggerGetchu.log(`开始获取网页内容`)

            // 获取 Getchu 页面内容
            async function fetchPage(url: string): Promise<string | null> {
                const res = await NetHelper.get(url, {
                    ...getchuOptions,
                    parse: 'arrayBuffer',
                    signal
                })
                if (!res.ok) {
                    return null
                }
                return StringHelper.decodeEucJp(res.body)
            }

            // 先使用编号搜索
            if (num.getchu) {
                const url = `https://www.getchu.com/item/${num.getchu}/?gc=gc`
                loggerGetchu.log(`使用编号搜索：${num.getchu}`)

                const body = await fetchPage(url)
                if (signal.aborted) return
                if (body) {
                    if (body.includes('年齢認証')) {
                        loggerGetchu.warn(`成人验证失败，无法获取网页内容`, url)
                        return
                    }

                    webContent.getchu = body
                    loggerGetchu.success(`获取到网页内容`)
                    return
                }

                loggerGetchu.log(`使用编号搜索失败，使用原标题搜索`, url)
            }

            // 如果编号搜索失败，则使用原标题搜索
            const searchKeyword = await StringHelper.encodeUrlEucJp(cutBannedWord(searchTitle))
            const searchUrl = `https://www.getchu.com/php/search.phtml?aurl=https://www.getchu.com/php/search.phtml&genre=anime_dvd&search_keyword=${searchKeyword}&check_key_dtl=1&submit=&gc=gc`

            const searchBody = await fetchPage(searchUrl)
            if (signal.aborted) return
            if (!searchBody) {
                loggerGetchu.warn(`获取搜索结果失败`, searchUrl)
                return
            }

            // 在视频列表中找到符合条件的第一个
            const $ = cheerioLoad(searchBody)
            const videoList = $('td > a.blueb[href*="/soft.phtml?id="]')
            const candidates = videoList
                .toArray()
                .map((el) => {
                    const item = $(el)
                    return {
                        title: item.text().trim(),
                        href: item.attr('href')?.trim()
                    }
                })
                .filter(
                    (item): item is { href: string; title: string } =>
                        !!item.title && !!item.href && !/box/i.test(item.title)
                )

            loggerGetchu.log(
                `搜索到${videoList.length}个番剧作为候选项：`,
                searchUrl,
                candidates.map((item) => item.title)
            )

            const match = StringHelper.bestMatch(
                searchTitle,
                candidates.map((item) => item.title)
            )
            if (!match) {
                loggerGetchu.warn(`没有找到匹配的番剧`)
                return
            }

            const href = candidates[match.index].href
            const id = href.match(/[?&]id=(?<id>\d+)/)?.groups?.id
            if (!id) {
                loggerGetchu.warn(`没有找到匹配的番剧`)
                return
            }

            const fullUrl = NetHelper.joinUrl('https://www.getchu.com/item', id, '?gc=gc')
            loggerGetchu.log(
                `选择第 ${match.index + 1} 个视频: 【${candidates[match.index].title}】`,
                fullUrl
            )

            // 根据href获取webContent
            const body = await fetchPage(fullUrl)
            if (signal.aborted) return
            if (!body) {
                loggerGetchu.warn(`获取网页内容失败`, fullUrl)
                return
            }

            if (body.includes('年齢認証')) {
                loggerGetchu.warn(`成人验证失败，无法获取网页内容`, fullUrl)
                return
            }

            // 记录num
            num.getchu = id
            webContent.getchu = body

            loggerGetchu.success(`获取到网页内容`)
        }

        async function getExtrafanartGetchu(): Promise<string[]> {
            if (!webContent.getchu) {
                loggerGetchu.log(`- 没有getchu，无法获取剧照`)
                return []
            }

            const $ = cheerioLoad(webContent.getchu)
            const hrefs = $('div.item-Samplecard a').map((_, el) => $(el).attr('href')?.trim())

            const urls = hrefs
                .toArray()
                .filter((href): href is string => !!href)
                .map((href) => NetHelper.joinUrl('https://www.getchu.com/', href))

            return await ScraperHelper.downloadExtrafanart(urls, { signal, ...getchuOptions })
        }

        function getPosterGetchu() {
            if (!webContent.getchu) return null

            const $ = cheerioLoad(webContent.getchu)
            const url = $('table#soft_table')
                .find('a')
                .first()
                .attr('href')
                ?.replace(/^\.\/ */, '')

            if (!url) return null
            return NetHelper.joinUrl('https://www.getchu.com/', url)
        }
        // #endregion Getchu网页内容获取

        // #region Dlsite网页内容获取
        async function getWebContentDlsite(searchTitle: string): Promise<void> {
            loggerDlsite.log(`开始获取网页内容`)

            // 先使用编号搜索
            if (num.dlsite) {
                const url = `https://www.dlsite.com/pro/work/=/product_id/${num.dlsite}.html?locale=ja_JP`

                loggerDlsite.log(`使用编号搜索：${num.dlsite}`)
                const res = await NetHelper.get(url, { ...dlsiteOptions, signal })
                if (signal.aborted) return
                if (res.ok) {
                    webContent.dlsite = res.body
                    loggerDlsite.success(`获取到网页内容`)
                    return
                }

                loggerDlsite.log(`使用编号搜索失败，使用原标题搜索`, url)
            }

            // 如果编号搜索失败，则使用原标题搜索
            searchTitle = StringHelper.fullToHalf(searchTitle)
            const keyword = StringHelper.encodeUrl(cutBannedWord(searchTitle)).replace(/%20/g, '+')
            const searchUrl = `https://www.dlsite.com/pro/fsr/=/language/jp/sex_category[0]/male/keyword/${keyword}/ana_flg/all/order/trend/work_type_category[0]/movie/options_and_or/and/options[0]/JPN/options[1]/CHI/options[2]/CHI_HANS/options[3]/CHI_HANT/options[4]/NM/from/fs.header`
            const res = await NetHelper.get(searchUrl, { ...dlsiteOptions, signal })
            if (!res.ok) {
                loggerDlsite.warn(`获取搜索结果失败`, searchUrl)
                return
            }

            // 在视频列表中找到匹配度最高的
            const $ = cheerioLoad(res.body)
            const videoList = $('ul#search_result_img_box > li .multiline_truncate a')
            const candidates = videoList
                .toArray()
                .map((el) => {
                    const item = $(el)
                    return {
                        title: item.text().trim(),
                        href: item.attr('href')?.trim()
                    }
                })
                .filter(
                    (item): item is { href: string; title: string } =>
                        !!item.title && !!item.href && !/box/i.test(item.title)
                )

            loggerDlsite.log(
                `搜索到${videoList.length}个番剧作为候选项：`,
                searchUrl,
                candidates.map((item) => item.title)
            )

            const match = StringHelper.bestMatch(
                searchTitle,
                candidates.map((item) => item.title)
            )
            if (!match) {
                loggerDlsite.warn(`没有找到匹配的番剧`)
                return
            }

            const href = candidates[match.index].href
            loggerDlsite.log(
                `选择第 ${match.index + 1} 个视频: 【${candidates[match.index].title}】`,
                href
            )

            // 根据href获取webContent
            const body = await NetHelper.get(href, { ...dlsiteOptions, signal })
            if (!body.ok) {
                loggerDlsite.warn(`获取网页内容失败`, href)
                return
            }

            // 记录num
            num.dlsite = href.split('/product_id/')[1].split('.')[0]
            webContent.dlsite = body.body

            loggerDlsite.success(`获取到网页内容`)
        }

        async function getExtrafanartDlsite(): Promise<string[]> {
            if (!webContent.dlsite) {
                loggerDlsite.log(`- 没有dlsite，无法获取剧照`)
                return []
            }

            const $ = cheerioLoad(webContent.dlsite)
            const urls = $('.product-slider-data')
                .children()
                .map((_, el) => $(el).attr('data-src'))
                .get()
                .filter((src) => !src.includes('_main.'))
                .map((href) => `https:${href.trim()}`)

            return await ScraperHelper.downloadExtrafanart(urls, { signal, ...dlsiteOptions })
        }
        // #endregion Dlsite网页内容获取

        // #region Fanza网页内容获取
        async function getFanza(url: string) {
            const res = await NetHelper.get(url, { ...fanzaOptions, signal })
            if (!res.ok) return res

            if (res.body.includes('18歳未満')) {
                // 开始绕过验证
                const $ = cheerioLoad(res.body)
                const redirectUrl = $('.turtle-component').find('a').attr('href')!
                return await NetHelper.get(redirectUrl, { signal })
            }

            return res
        }

        async function getWebContentFanza(searchTitle: string): Promise<void> {
            loggerFanza.log(`开始获取网页内容`)

            // 先使用编号搜索
            if (num.fanza) {
                const url = `https://www.dmm.co.jp/mono/anime/-/detail/=/cid=${num.fanza}/`

                loggerFanza.log(`使用编号搜索：${num.fanza}`)
                const res = await getFanza(url)
                if (signal.aborted) return
                if (res.ok) {
                    webContent.fanza = res.body
                    loggerFanza.success(`获取到网页内容`)
                    return
                }

                loggerFanza.log(`使用编号搜索失败，使用原标题搜索`, url)
            }

            // 如果编号搜索失败，则使用原标题搜索
            const searchUrl = `https://www.dmm.co.jp/mono/anime/-/search/=/searchstr=${StringHelper.encodeUrl(cutBannedWord(searchTitle))}/`
            const res = await getFanza(searchUrl)
            if (signal.aborted) return
            if (!res.ok) {
                loggerFanza.warn(`获取搜索结果失败`, searchUrl)
                return
            }

            // 在视频列表中找到匹配度最高的
            const $ = cheerioLoad(res.body)
            const videoList = $('ul#list p.tmb > a')
            const candidates = videoList
                .toArray()
                .map((el) => {
                    const item = $(el)
                    return {
                        title: item.find('span.txt').text().trim(),
                        href: item.attr('href')?.trim()
                    }
                })
                .filter(
                    (item): item is { href: string; title: string } =>
                        !!item.title && !!item.href && !/box/i.test(item.title)
                )

            loggerFanza.log(
                `搜索到${candidates.length}个番剧作为候选项：`,
                searchUrl,
                candidates.map((item) => item.title)
            )

            const match = StringHelper.bestMatch(
                searchTitle,
                candidates.map((item) => item.title)
            )
            if (!match) {
                loggerFanza.warn(`没有找到匹配的番剧`)
                return
            }

            const href = candidates[match.index].href
            loggerFanza.log(
                `选择第 ${match.index + 1} 个视频: 【${candidates[match.index].title}】`,
                href
            )

            // 根据href获取webContent
            const detailContent = await NetHelper.get(href, { ...fanzaOptions, signal })
            if (!detailContent.ok) {
                loggerFanza.warn(`获取网页内容失败`, href)
                return
            }

            // 记录num
            num.fanza = href.match(/\/cid=(?<id>[^/]+)\//)?.groups?.id || ''
            webContent.fanza = detailContent.body

            loggerFanza.success(`获取到网页内容`)
        }

        async function getExtrafanartFanza(): Promise<string[]> {
            if (!webContent.fanza) {
                loggerFanza.log(`- 没有fanza，无法获取剧照`)
                return []
            }

            const $ = cheerioLoad(webContent.fanza)
            const urls = $('ul#sample-image-block')
                .find('li')
                .filter((_, el) => $(el).find('a').attr('id')?.startsWith('sample') === true)
                .map((_, el) =>
                    $(el)
                        .find('img')
                        .attr('data-lazy')
                        // 转为大图
                        ?.replace(
                            /(?<prefix>\/digital\/video\/[^/]+\/[^/]+)-(?<index>\d+)\.jpg$/,
                            '$<prefix>jp-$<index>.jpg'
                        )
                )
                .toArray()

            return await ScraperHelper.downloadExtrafanart(urls, { signal, ...fanzaOptions })
        }
        // #endregion Fanza网页内容获取

        // #region 字段解析辅助
        function parseTagValue(): false | string[] {
            if (tag && tag.length > 0) return tag

            const $ = cheerioLoad(webContent.hanime1)
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

            tag = tags
            return tags
        }

        const getPosterUrl = DebugHelper.withMutex(async () => {
            if (posterUrl) return

            // 从fanza获取
            if (webContent.fanza) {
                const $ = cheerioLoad(webContent.fanza)
                posterUrl = $('meta[property="og:image"]').attr('content')?.trim() || ''
                return
            }

            // 从hanime1获取
            if (webContent.hanime1) {
                posterUrl =
                    (await getPosterHanime1(
                        video.originaltitle || video.title || video.sorttitle
                    )) || ''
            }
        })
        // #endregion 字段解析辅助

        return {
            // #region 刮削步骤
            async getWebContext() {
                if (webContent.hanime1) {
                    return true
                }

                const searchTitle = video.originaltitle || video.title || video.sorttitle
                num.hanime1 = video.num.hanime1 ?? ''
                num.getchu = video.num.getchu ?? ''
                num.dlsite = video.num.dlsite ?? ''
                num.fanza = video.num.fanza ?? ''

                // 获取webContent
                await Promise.all([
                    getWebContentHanime1(searchTitle),
                    getWebContentGetchu(searchTitle),
                    getWebContentDlsite(searchTitle),
                    getWebContentFanza(searchTitle)
                ])

                return Boolean(webContent.hanime1)
            },
            async parseTitle() {
                const $ = cheerioLoad(webContent.hanime1)
                let title = $('.video-description-panel').children().eq(1).text().trim()
                title = TransHelper.translateSC(title)

                if (!title) return false
                return title
            },
            async parseOriginaltitle() {
                const $ = cheerioLoad(webContent.hanime1)
                let value = $('h3#shareBtn-title').text()
                value = StringHelper.removeBraces(value).split('[中文字幕]')[0].trim()

                return value || false
            },
            async parseSorttitle() {
                const $ = cheerioLoad(webContent.hanime1)
                let value = $('h3#shareBtn-title').text()
                value = StringHelper.removeBraces(value).split('[中文字幕]')[0].trim()

                return value || false
            },
            async parseTagline() {
                return null
            },
            async parseNum() {
                return {
                    hanime1: num.hanime1,
                    getchu: num.getchu,
                    dlsite: num.dlsite,
                    fanza: num.fanza
                }
            },
            async parseMpaa() {
                return 'JP-18+'
            },
            async parseRating() {
                // dlsite
                if (num.dlsite) {
                    loggerDlsite.log(`搜索评分...`)

                    const url = `https://www.dlsite.com/maniax/product/info/ajax?product_id=${num.dlsite}&cdn_cache_min=1`
                    const res = await NetHelper.get(url, { ...dlsiteOptions, signal })
                    if (signal.aborted) return false
                    if (res.ok) {
                        const item = JSON.parse(res.body)[num.dlsite]
                        if (item) {
                            const rating = item.rate_average_2dp
                            if (rating) {
                                return (Number.parseFloat(rating) * 2).toString()
                            }
                        }
                    }

                    loggerDlsite.warn(`没有找到评分`)
                } else {
                    loggerDlsite.warn(`找不到dlsite页面，无法获取评分`)
                }

                return false
            },
            async parseDirector() {
                // dlsite
                if (webContent.dlsite) {
                    loggerDlsite.log(`搜索导演...`)

                    const $ = cheerioLoad(webContent.dlsite)
                    const text = $('#work_right_inner').text()

                    interface IDlsiteStaff {
                        name: string
                        role?: string
                    }

                    const dlsiteStaffCategories = [
                        'シナリオ',
                        'イラスト',
                        '声優',
                        'その他'
                    ] as const
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
                        return director.name
                    }

                    loggerDlsite.warn(`没有找到导演`)
                }

                // getchu
                if (webContent.getchu) {
                    loggerGetchu.log(`搜索导演...`)

                    const $ = cheerioLoad(webContent.getchu)
                    const regex1 = /監督([^：]*)：\n?(?<name>[^／\n ]+)/
                    const regex2 = /プロデューサー([^：]*)：(?<name>.*)[\n ]/

                    for (const el of $('div#wrapper').find('div.tablebody').toArray()) {
                        const text = $(el).text()
                        const director =
                            text.match(regex1)?.groups?.name.trim() ||
                            text.match(regex2)?.groups?.name.trim()

                        if (director) {
                            return director
                        }
                    }

                    loggerGetchu.warn(`没有找到导演`)
                }

                return false
            },
            async parseActor() {
                return null
            },
            async parseStudio() {
                const $ = cheerioLoad(webContent.hanime1)
                let value = $('a#video-artist-name').text().trim()
                if (value in maker_trans) {
                    value = maker_trans[value]
                }

                return value || false
            },
            async parseMaker() {
                const $ = cheerioLoad(webContent.hanime1)
                let value = $('a#video-artist-name').text().trim()
                if (value in maker_trans) {
                    value = maker_trans[value]
                }

                return value || false
            },
            async parseSet() {
                const $ = cheerioLoad(webContent.hanime1)
                const titles = $('.single-icon-wrapper.video-playlist-top').children('h4')

                // 先获取视频数量，如果只有一个视频就返回null
                const count = toNumber(titles.last().text().match(/\d+/)?.[0]) ?? 0
                if (count <= 1) return null

                // 否则获取系列名
                let set = titles.first().text()
                set = set.includes('/') ? set.split('/')[1].trim() : set.trim()

                if (!set) return false
                return set
            },
            async parseTag() {
                return parseTagValue()
            },
            async parseGenre() {
                return parseTagValue()
            },
            async parsePlot() {
                let plot = (() => {
                    // 先看getchu能不能获取
                    if (webContent.getchu) {
                        const $ = cheerioLoad(webContent.getchu)
                        const title =
                            $('h3')
                                .toArray()
                                .find((el) => $(el).text().trim() === 'ストーリー') ||
                            $('h3')
                                .toArray()
                                .find((el) => $(el).text().trim() === '商品紹介')
                        const plot = $(title)
                            .next()
                            .find('span')
                            .clone()
                            .find('.navyb')
                            .remove()
                            .end()
                            .text()
                            .trim()

                        if (plot) return plot
                    }

                    // 用fanza
                    if (webContent.fanza) {
                        const $ = cheerioLoad(webContent.fanza)
                        const value = $('.wrapper-detailContents')
                            .next()
                            .next()
                            .find('p')
                            .text()
                            .trim()

                        if (value) return value
                    }

                    // 用dlsite
                    if (webContent.dlsite) {
                        const $ = cheerioLoad(webContent.dlsite)
                        const value = $('div')
                            .filter((_i, el) => $(el).text().trim() === '作品内容')
                            .next()
                            .text()
                            .trim()

                        if (value) return value
                    }

                    // dlsite也没有的话，用hanime
                    const $ = cheerioLoad(webContent.hanime1)
                    let value = $('div.video-caption-text').text().trim()

                    value = value.split('[中文字幕]')?.pop()?.split('·')?.pop() ?? ''

                    return value
                })()

                if (signal.aborted) return false

                const re = await TransHelper.translate(StringHelper.removeBraces(plot))
                plot = re.text

                if (!plot) return false
                return plot
            },
            async parseYear() {
                const $ = cheerioLoad(webContent.hanime1)
                const text = $('.video-description-panel').children().eq(0).text()
                const match = text.match(/\d{4}/)
                const year = match ? match[0] : ''
                if (!year) return false

                return year
            },
            async parsePremiered() {
                const $ = cheerioLoad(webContent.hanime1)
                const text = $('.video-description-panel').children().eq(0).text()
                const match = text.match(/\d{4}-\d{2}-\d{2}/)
                const premiered = match ? match[0] : ''

                if (!premiered) return false
                return premiered
            },
            async parseReleasedate() {
                const $ = cheerioLoad(webContent.hanime1)
                const text = $('.video-description-panel').children().eq(0).text()
                const match = text.match(/\d{4}-\d{2}-\d{2}/)
                const releasedate = match ? match[0] : ''

                if (!releasedate) return false
                return releasedate
            },
            async parsePoster() {
                // 有getchu直接用getchu的
                const poster = getPosterGetchu()
                if (poster) {
                    const posterPath = await ScraperHelper.downloadImage(
                        poster,
                        {
                            signal,
                            ...getchuOptions
                        },
                        {
                            resize: {
                                maxWidth: posterScale.maxWidth,
                                maxHeight: posterScale.maxHeight,
                                minWidth: posterScale.minWidth,
                                minHeight: posterScale.minHeight
                            }
                        }
                    )
                    if (posterPath) return posterPath
                }

                // 用其他的
                await getPosterUrl()

                if (!posterUrl) return false

                const srcImagePath = await ScraperHelper.downloadImage(
                    posterUrl,
                    {
                        signal
                    },
                    {
                        resize: {
                            maxWidth: posterScale.maxWidth,
                            maxHeight: posterScale.maxHeight,
                            minWidth: posterScale.minWidth,
                            minHeight: posterScale.minHeight
                        }
                    }
                )

                return srcImagePath || false
            },
            async parseThumb() {
                // 有getchu直接用getchu的
                const thumb = getPosterGetchu()
                if (thumb) {
                    const posterPath = await ScraperHelper.downloadImage(
                        thumb,
                        {
                            signal,
                            ...getchuOptions
                        },
                        {
                            resize: {
                                maxWidth: thumbScale.maxWidth,
                                maxHeight: thumbScale.maxHeight,
                                minWidth: thumbScale.minWidth,
                                minHeight: thumbScale.minHeight
                            }
                        }
                    )
                    if (posterPath) return posterPath
                }

                // 用其他的
                await getPosterUrl()

                if (!posterUrl) return false

                const srcImagePath = await ScraperHelper.downloadImage(
                    posterUrl,
                    {
                        signal
                    },
                    {
                        resize: {
                            maxWidth: thumbScale.maxWidth,
                            maxHeight: thumbScale.maxHeight,
                            minWidth: thumbScale.minWidth,
                            minHeight: thumbScale.minHeight
                        }
                    }
                )

                return srcImagePath || false
            },
            async parseFanart() {
                // 有getchu直接用getchu的
                const fanart = getPosterGetchu()
                if (fanart) {
                    const posterPath =
                        (await ScraperHelper.downloadImage(fanart, {
                            signal,
                            ...getchuOptions
                        })) || ''
                    if (posterPath) {
                        // 超分一下
                        const path = await MediaHelper.superResolutionImage(posterPath)
                        return path || false
                    }
                }

                // 用其他的
                await getPosterUrl()

                if (!posterUrl) return false

                const posterPath =
                    (await ScraperHelper.downloadImage(posterUrl, {
                        signal
                    })) || ''

                if (!posterPath) return false

                // 超分一下
                const path = await MediaHelper.superResolutionImage(posterPath)
                return path || false
            },
            async parseExtrafanart() {
                // 从getchu获取
                let extrafanarts = await getExtrafanartGetchu()

                // 从fanza获取
                if (extrafanarts.length === 0) {
                    extrafanarts = await getExtrafanartFanza()
                }

                // 从dlsite获取
                if (extrafanarts.length === 0) {
                    extrafanarts = await getExtrafanartDlsite()
                }

                if (extrafanarts.length === 0) return false

                // 下载
                return extrafanarts
            },
            async parseOutput(): Promise<{ dir: string; fileName: string }> {
                const dir = `${video.set}/${video.originaltitle}`
                return { dir, fileName: video.originaltitle }
            }
            // #endregion 刮削步骤
        }
    }
)

export default useScraper

function cutBannedWord(str: string): string {
    // 1. 为每个分隔符转义特殊字符（如 . * + 等），然后用 | 拼接成正则
    const escapedDelimiters = bannedWord.map((d) => escapeRegExp(d))
    const pattern = new RegExp(escapedDelimiters.join('|'))

    // 2. 找到第一个匹配的分隔符的位置
    const match = str.match(pattern)
    if (!match || match.index === undefined) {
        return str // 没有匹配，返回原字符串
    }

    // 3. 截取分隔符之前的部分
    return str.substring(0, match.index)
}

function escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
