import type { IActor } from '@renderer/scraper'

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
import { Actor, translateTags } from '@renderer/scraper'
import { load as cheerioLoad } from 'cheerio'
import dayjs from 'dayjs'

import { logger, scraperName } from './type'

const gigaUrl = 'https://www.giga-web.jp'

const gigaOptions = {
    headers: {
        referer: `${gigaUrl}/`
    }
}

// 匹配商品链接中的商品编号
const productIdRegex = /product_id=(?<id>\d+)/
// 匹配作品番号，如 SPSC-29
const videoNumRegex = /(?<num>[A-Z]+-\d+)/i
// 匹配评分，如「5点満点中 3.22」
const ratingRegex = /5点満点中\s*(?<rating>\d+(?:\.\d+)?)/
// 判断是否为纯数字编号
const numericRegex = /^\d+$/
// 匹配末尾的方括号标记，如 [BAD END]
const trailingBracketRegex = /\[[^\]]*\]$/

// #region 设置cookie
NetHelper.setCookie({
    url: `${gigaUrl}/`,
    domain: 'giga-web.jp',
    value: {
        old_check: 'yes',
        layout: 'jpn'
    }
})
// #endregion

const useScraper = ScraperHelper.defineScraper(
    scraperName,
    {
        GIGA: `${gigaUrl}/product/index.php?product_id={num}`
    },
    (video, signal: AbortSignal) => {
        // #region temp变量
        let webContent = ''
        let num = ''
        let cookieInitialized = false
        let actor: Actor[] | null = null
        // #endregion temp变量

        /**
         * 把相对链接转为绝对链接
         * @param url 链接
         */
        function toAbsoluteUrl(url: string) {
            return /^https?:\/\//.test(url) ? url : NetHelper.joinUrl(gigaUrl, url)
        }

        /**
         * 初始化年龄确认和会话 cookie
         * @param referer 目标页面链接
         */
        async function initCookie(referer: string) {
            if (cookieInitialized) return

            // 该页面会写入 old_check、PHPSESSID 等 cookie
            await NetHelper.get(`${gigaUrl}/cookie_set.php`, {
                signal,
                headers: { referer },
                retry: 0,
                delay: 0
            })
            cookieInitialized = true
        }

        /**
         * 判断是否为年龄确认页
         * @param html 网页内容
         */
        function isAgeCheckPage(html: string) {
            return html.includes('18歳以上ですか')
        }

        /**
         * 请求网页内容，遇到年龄确认页时自动初始化 cookie 重试
         * @param url 网页链接
         */
        async function getHtml(url: string): Promise<string | null> {
            const request = async () => {
                const res = await NetHelper.get(url, { signal, ...gigaOptions })
                if (!res.ok) {
                    logger.warn(`获取网页内容失败`, url)
                    return null
                }

                return res.body
            }

            await initCookie(url)
            let html = await request()

            if (html && isAgeCheckPage(html)) {
                // cookie 失效时重新初始化一次
                cookieInitialized = false
                await initCookie(url)
                html = await request()
            }

            if (!html || isAgeCheckPage(html)) {
                logger.warn(`获取网页内容失败，请检查网络或代理`)
                return null
            }

            return html
        }

        /**
         * 获取商品页内容
         * @param url 商品页链接
         */
        async function getWebContent(url: string): Promise<boolean> {
            const html = await getHtml(url)
            if (!html) return false

            webContent = html
            logger.success(`获取到网页内容`)
            return true
        }

        /**
         * 通过关键词搜索商品
         * @param keyword 搜索关键词
         */
        async function searchProduct(keyword: string): Promise<string | null> {
            const url = `${gigaUrl}/search/?keyword=${StringHelper.encodeUrl(keyword)}`
            const html = await getHtml(url)
            if (!html) return null

            const $ = cheerioLoad(html)
            const videoList = $('.search_sam_box')
                .toArray()
                .flatMap((el) => {
                    const item = $(el)
                    // 同一作品有封面图和标题两个链接，取带文本的那个
                    const link = item
                        .find('a[href*="product/index.php?product_id="]')
                        .filter((_, a) => Boolean($(a).text().trim()))
                        .first()
                    const href = link.attr('href')?.trim()
                    const title = link.text().trim()
                    // 带上番号等信息一起用于匹配
                    const matchText = item.text().replace(/\s+/g, ' ').trim()

                    if (!href || !title) return []
                    return [{ href: toAbsoluteUrl(href), title, matchText }]
                })

            logger.log(
                `搜索到${videoList.length}个作品作为候选项：`,
                url,
                videoList.map((item) => item.title)
            )

            const match = StringHelper.bestMatch(
                keyword,
                videoList.map((item) => item.matchText)
            )
            if (!match) {
                logger.warn(`未找到匹配的作品`)
                return null
            }

            const targetVideo = videoList[match.index]
            logger.log(
                `选择第 ${match.index + 1} 个作品：【${targetVideo.title}】`,
                targetVideo.href
            )

            return targetVideo.href
        }

        /**
         * 获取演员信息
         */
        const getActor = DebugHelper.withMutex(async () => {
            if (actor) return true

            const $ = cheerioLoad(webContent)
            const actorNames = $('#works_txt li dl')
                .filter((_, el) => $(el).find('dt').text().trim() === '出演女優')
                .find('dd a')
                .toArray()
                .map((el) => $(el).text().trim())
                .filter((name) => name && !/[?？]/.test(name))

            if (!actorNames.length) return false

            const actorObjs = actorNames.map((name) => new Actor(name, 'female'))

            // 查询演员详情
            await Promise.all(actorObjs.map((actorObj) => actorObj.search(signal)))
            if (signal.aborted) return false

            actor = actorObjs
            return true
        })

        /**
         * 获取商品页上的信息字段
         * @param label 字段名称
         */
        function getInfoValue(label: string) {
            const $ = cheerioLoad(webContent)
            return $('#works_txt li dl')
                .filter((_, el) => $(el).find('dt').text().trim() === label)
                .first()
                .find('dd')
                .first()
                .text()
                .trim()
        }

        /**
         * 获取作品标题
         */
        function getTitle() {
            const $ = cheerioLoad(webContent)
            return $('#works_pic h5').text().replace(/\s+/g, ' ').trim()
        }

        /**
         * 获取封面链接
         */
        function getPosterUrl() {
            const $ = cheerioLoad(webContent)
            const src = $('#works_pic img').first().attr('src')?.trim()
            return src ? toAbsoluteUrl(src) : ''
        }

        /**
         * 获取上映日期
         */
        function getReleaseDate() {
            const date = dayjs(getInfoValue('DVDリリース日'))
            return date.isValid() ? date : null
        }

        /**
         * 获取完整剧情
         */
        function getStoryText() {
            const $ = cheerioLoad(webContent)
            const texts = ['#story_list2 .story_window', '#story_list1 .story_window'].map(
                (selector) => {
                    const node = $(selector).first().clone()
                    node.find('span').remove()
                    return node.text().replace(/\s+/g, ' ').trim()
                }
            )

            return texts.find(Boolean) ?? ''
        }

        /**
         * 获取标签
         * @param header 标签分组名称
         */
        function getTags(header: string) {
            const $ = cheerioLoad(webContent)
            const tags = $('div#tag')
                .toArray()
                .filter((el) => $(el).find('#tag_header').text().includes(header))
                .flatMap((el) =>
                    $(el)
                        .find('#tag_main a[href*="tag_id="]')
                        .toArray()
                        .map((a) => $(a).text().trim())
                        .filter(Boolean)
                )

            return [...new Set(tags)]
        }

        return {
            // #region 刮削上下文
            async getWebContext() {
                if (webContent) {
                    return true
                }

                num = video.num.GIGA ?? ''

                // 编号为 - 时跳过该刮削源
                if (num === '-') {
                    logger.warn(`已跳过 GIGA 刮削源`)
                    return false
                }

                // 编号是商品id，直接进入商品页
                if (numericRegex.test(num)) {
                    if (await getWebContent(`${gigaUrl}/product/index.php?product_id=${num}`)) {
                        return true
                    }
                }

                // 否则用番号或标题搜索
                const keyword =
                    video.title.match(videoNumRegex)?.groups?.num ||
                    video.originaltitle.match(videoNumRegex)?.groups?.num ||
                    video.sorttitle.match(videoNumRegex)?.groups?.num ||
                    StringHelper.removeBraces(
                        video.title || video.sorttitle || video.originaltitle
                    ).trim()
                if (!keyword) {
                    logger.warn(`没有可用于搜索的番号或标题`)
                    return false
                }

                const href = await searchProduct(keyword)
                if (!href) return false

                if (!(await getWebContent(href))) return false

                // 记录商品编号
                num = href.match(productIdRegex)?.groups?.id ?? ''
                return true
            },
            // #endregion

            // #region 标题
            async parseTitle() {
                const workNum = getInfoValue('作品番号')
                if (!workNum) return false
                return workNum
            },
            // #endregion

            // #region 原标题
            async parseOriginaltitle() {
                let title = getTitle()
                if (!title) return false

                // 翻译一下
                const re = await TransHelper.translate(StringHelper.removeBraces(title), false)
                if (re.ok) title = re.text

                return title
            },
            // #endregion

            // #region 排序标题
            async parseSorttitle() {
                const workNum = getInfoValue('作品番号')
                if (!workNum) return false
                return workNum
            },
            // #endregion

            // #region 宣传词
            async parseTagline() {
                return null
            },
            // #endregion

            // #region 编号
            async parseNum() {
                return {
                    GIGA: num
                }
            },
            // #endregion

            // #region 分级
            async parseMpaa() {
                return 'JP-18+'
            },
            // #endregion

            // #region 评分
            async parseRating() {
                const $ = cheerioLoad(webContent)
                const rating = $('#review_header').text().match(ratingRegex)?.groups?.rating
                if (!rating) return false

                return (Number.parseFloat(rating) * 2).toString()
            },
            // #endregion

            // #region 导演
            async parseDirector() {
                const director = getInfoValue('監督')
                if (!director) return false
                return director
            },
            // #endregion

            // #region 演员
            async parseActor() {
                if (!(await getActor())) return false

                return actor!.map((actorObj): IActor => ({
                    name: actorObj.name,
                    role: actorObj.role,
                    imgUrl: actorObj.imgUrl
                }))
            },
            // #endregion

            // #region 发行商
            async parseStudio() {
                return 'GIGA'
            },
            // #endregion

            // #region 制片商
            async parseMaker() {
                return 'GIGA'
            },
            // #endregion

            // #region 影片系列
            async parseSet() {
                return null
            },
            // #endregion

            // #region 标签
            async parseTag() {
                const tags = getTags('ジャンルタグ')
                if (!tags.length) return false
                return await translateTags(tags)
            },
            // #endregion

            // #region 类型
            async parseGenre() {
                const genres = getTags('キャラクタータグ')
                if (!genres.length) return false
                return await translateTags(genres)
            },
            // #endregion

            // #region 简介
            async parsePlot() {
                let plot = getStoryText()

                if (plot) {
                    plot = StringHelper.removeBraces(plot).trim()

                    // 去掉末尾的方括号标记，如 [BAD END]
                    plot = plot.replace(trailingBracketRegex, '').trim()

                    // 翻译一下
                    if (plot) plot = (await TransHelper.translate(plot)).text
                }

                // 加上演员信息
                if (await getActor()) {
                    actor!.forEach((actorObj) => {
                        plot += actorObj.toString()
                    })
                }

                plot = plot.trim()
                if (plot.startsWith('----------------')) plot = plot.replace('----------------', '')
                plot = plot.trim()

                if (!plot) return false
                return plot
            },
            // #endregion

            // #region 发行年份
            async parseYear() {
                const date = getReleaseDate()
                if (!date) return false
                return date.year().toString()
            },
            // #endregion

            // #region 首映日期
            async parsePremiered() {
                const date = getReleaseDate()
                if (!date) return false
                return date.format('YYYY-MM-DD')
            },
            // #endregion

            // #region 上映日期
            async parseReleasedate() {
                const date = getReleaseDate()
                if (!date) return false
                return date.format('YYYY-MM-DD')
            },
            // #endregion

            // #region 封面
            async parsePoster() {
                const posterUrl = getPosterUrl()
                if (!posterUrl) return false

                return await ScraperHelper.downloadImage(
                    posterUrl,
                    {
                        signal,
                        ...gigaOptions
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
            },
            // #endregion

            // #region 缩略图
            async parseThumb() {
                const posterUrl = getPosterUrl()
                if (!posterUrl) return false

                return await ScraperHelper.downloadImage(
                    posterUrl,
                    {
                        signal,
                        ...gigaOptions
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
            },
            // #endregion

            // #region 背景图
            async parseFanart() {
                const posterUrl = getPosterUrl()
                if (!posterUrl) return false

                const srcImagePath = await ScraperHelper.downloadImage(posterUrl, {
                    signal,
                    ...gigaOptions
                })
                if (!srcImagePath) return false

                // 封面只有480宽，超分后使用
                const [re] = await MediaHelper.superResolutionImage([srcImagePath])
                if (!re) return false

                return re
            },
            // #endregion

            // #region 额外背景图
            async parseExtrafanart() {
                const $ = cheerioLoad(webContent)
                const urls = $('a[href*="/sample/"][href$="_l.jpg"]')
                    .toArray()
                    .map((el) => $(el).attr('href')?.trim() || '')
                    .filter(Boolean)
                    .map((url) => toAbsoluteUrl(url))
                    .filter((url, index, arr) => arr.indexOf(url) === index)

                if (!urls.length) return false

                const extrafanarts = await ScraperHelper.downloadExtrafanart(urls, {
                    signal,
                    ...gigaOptions
                })
                if (!extrafanarts.length) return false

                return extrafanarts
            },
            // #endregion

            // #region 输出
            async parseOutput(): Promise<{ dir: string; fileName: string }> {
                const set = video.sorttitle.split('-')[0]

                const dir = `${set}/${video.sorttitle}`
                return { dir, fileName: video.title }
            }
            // #endregion
        }
    }
)

export default useScraper
