import type { NumResponse, TitleResponse } from '@renderer/plugins/AV/fanza'

import {
    DebugHelper,
    EncodeHelper,
    MediaHelper,
    NetHelper,
    posterScale,
    ScraperHelper,
    thumbScale,
    TransHelper
} from '@renderer/helper'
import { fanzaUrl, getNumBody, getTitleBody } from '@renderer/plugins/AV/fanza'
import {
    logger,
    loggerFanza,
    loggerJable,
    loggerJavDB,
    loggerMsg,
    scraperName
} from '@renderer/plugins/AV/type'
import { Actor } from '@renderer/scraper'
import { load as cheerioLoad } from 'cheerio'
import dayjs from 'dayjs'
import { isNaN, toNumber } from 'es-toolkit/compat'

// #region 设置cookie
NetHelper.setCookie({
    url: 'https://javdb.com/',
    domain: 'javdb.com',
    value: {
        over18: '1',
        locale: 'zh'
    }
})

NetHelper.setCookie({
    url: 'https://www.mgstage.com/',
    domain: 'mgstage.com',
    value: {
        adc: '1'
    }
})

NetHelper.setCookie({
    url: 'https://video.dmm.co.jp/',
    domain: 'dmm.co.jp',
    value: {
        age_check_done: '1'
    }
})
// #endregion

const useScraper = ScraperHelper.defineScraper(
    scraperName,
    {
        javDB: 'https://javdb.com/v/{num}/',
        jable: 'https://jable.tv/videos/{num}/',
        MGS: 'https://www.mgstage.com/product/product_detail/{num}/',
        Fanza: 'https://video.dmm.co.jp/av/content/?id={num}&i3_ref=search&i3_ord=1&i3_pst=1&dmmref=video_search'
    },
    (video, signal: AbortSignal) => {
        // #region temp变量
        const num = {
            javDB: '',
            jable: '',
            MGS: '',
            Fanza: ''
        }

        const webContent = {
            javDB: '',
            jable: '',
            MGS: '',
            Fanza: null as NumResponse.PpvContent | null
        }

        let actor: Actor[] | null = null

        /**
         * 番号后缀，CU、UC、C、U
         */
        let _suffix = ''

        const image = {
            smallImgUrl: '',
            bigImgUrl: ''
        }
        // #endregion temp变量

        // #region JavDB网页内容获取
        async function getWebContentJavDB(searchTitle: string): Promise<void> {
            // 先使用编号搜索
            if (num.javDB) {
                const url = `https://javdb.com/v/${num.javDB}/`
                const res = await NetHelper.get(url, {
                    signal
                })
                if (signal.aborted) return
                if (res.ok) {
                    webContent.javDB = res.body
                    loggerJavDB.success(`获取到网页内容`)
                    return
                }

                loggerJavDB.log(`使用编号搜索失败，使用原标题搜索`, url)
            }

            // 如果编号搜索失败，则使用原标题搜索
            const url = `https://javdb.com/search?q=${EncodeHelper.encodeUrl(searchTitle)}&f=all/`
            const res = await NetHelper.get(url, {
                signal
            })
            if (!res.ok) {
                loggerJavDB.warn(`获取网页内容失败`)
                return
            }

            const $ = cheerioLoad(res.body)
            const videoListRaw = $('.movie-list .item')
                .toArray()
                .map((el) => {
                    const item = $(el)
                    const href = item.find('a.box').attr('href')?.trim()
                    const title = item.find('.video-title strong').text().trim()
                    const time = item.find('.meta').text().trim()

                    return {
                        href: href ? NetHelper.joinUrl('https://javdb.com/', href) : '',
                        title,
                        time: dayjs(time)
                    }
                })
                .filter(
                    (item): item is { href: string; title: string; time: dayjs.Dayjs } =>
                        !!item.href && !!item.title
                )

            const videoMap = new Map<string, (typeof videoListRaw)[number]>()

            // 同名标题只保留时间最近的一个
            for (const item of videoListRaw) {
                const oldItem = videoMap.get(item.title)
                if (!oldItem) {
                    videoMap.set(item.title, item)
                    continue
                }

                const oldTime = oldItem.time.isValid() ? oldItem.time.valueOf() : 0
                const newTime = item.time.isValid() ? item.time.valueOf() : 0
                if (newTime > oldTime) {
                    videoMap.set(item.title, item)
                }
            }

            const videoList = Array.from(videoMap.values()).sort(
                (a, b) => b.time.valueOf() - a.time.valueOf()
            )

            loggerJavDB.log(
                `搜索到${videoList.length}个视频作为候选项：`,
                url,
                videoList.map((item) => item.title)
            )

            // 选择最佳匹配的视频
            const match = EncodeHelper.bestMatch(
                searchTitle,
                videoList.map((item) => item.title)
            )
            if (!match) {
                loggerJavDB.warn(`未找到匹配的视频`)
                return
            }

            const targetVideo = videoList[match.index]
            loggerJavDB.log(
                `选择第 ${match.index + 1} 个视频:【 ${targetVideo.title}】`,
                targetVideo.href
            )

            // 获取目标视频的webContent
            const re = await NetHelper.get(targetVideo.href, { signal })
            if (!re.ok) {
                loggerJavDB.warn(`获取网页内容失败`)
                return
            }

            // 记录
            num.javDB = targetVideo.href.split(/[/\\]/).filter(Boolean).at(-1) || ''
            webContent.javDB = re.body

            loggerJavDB.success(`获取到网页内容`)
        }
        // #endregion JavDB网页内容获取

        // #region jable网页内容获取
        async function getWebContentJable(searchTitle: string): Promise<void> {
            // 先使用编号搜索
            if (num.jable) {
                const url = `https://jable.tv/videos/${num.jable}/`
                const res = await NetHelper.get(url, {
                    signal
                })
                if (signal.aborted) return
                if (res.ok) {
                    webContent.jable = res.body
                    loggerJable.success(`获取到网页内容`)
                    return
                }

                loggerJable.log(`使用编号搜索失败，使用原标题搜索`, url)
            }

            // 如果编号搜索失败，则使用原标题搜索
            const url = `https://jable.tv/search/${EncodeHelper.encodeUrl(searchTitle)}/`
            const res = await NetHelper.get(url, {
                signal
            })
            if (!res.ok) {
                loggerJable.warn(`获取网页内容失败`)
                return
            }

            const $ = cheerioLoad(res.body)
            const videoList = $('.video-img-box .title a')
                .toArray()
                .map((el) => {
                    const item = $(el)
                    return {
                        href: item.attr('href')?.trim(),
                        title: item.text().trim()
                    }
                })
                .filter(
                    (item): item is { href: string; title: string } => !!item.href && !!item.title
                )

            loggerJable.log(
                `搜索到${videoList.length}个视频作为候选项：`,
                url,
                videoList.map((item) => item.title)
            )

            const match = EncodeHelper.bestMatch(
                searchTitle,
                videoList.map((item) => item.title)
            )
            if (!match) {
                loggerJable.warn(`未找到匹配的视频`)
                return
            }

            const targetVideo = videoList[match.index]
            loggerJable.log(
                `选择第 ${match.index + 1} 个视频: 【${targetVideo.title}】`,
                targetVideo.href
            )

            // 获取目标视频的webContent
            const re = await NetHelper.get(targetVideo.href, { signal })
            if (!re.ok) {
                loggerJable.warn(`获取网页内容失败`)
                return
            }

            // 记录
            num.jable = targetVideo.href.split(/[/\\]/).filter(Boolean).at(-1) || ''
            webContent.jable = re.body

            loggerJable.success(`获取到网页内容`)
        }

        // #endregion

        // #region MGS网页内容获取
        async function getWebContentMgs(searchTitle: string) {
            // 先使用编号搜索
            if (num.MGS) {
                const url = `https://www.mgstage.com/product/product_detail/${num.MGS}/`
                const res = await NetHelper.get(url, {
                    signal
                })
                if (signal.aborted) return
                if (res.ok) {
                    webContent.MGS = res.body
                    loggerMsg.success(`获取到网页内容`)
                    return
                }

                loggerMsg.log(`使用编号搜索失败，使用原标题搜索`, url)
            }

            // 如果编号搜索失败，则使用原标题搜索
            const url = `https://www.mgstage.com/search/cSearch.php?search_word=${EncodeHelper.encodeUrl(remove大括号(searchTitle))}&x=17&y=12&search_shop_id=&type=top/`
            const res = await NetHelper.get(url, {
                signal
            })
            if (!res.ok) {
                loggerMsg.warn(`获取网页内容失败`)
                return
            }

            const $ = cheerioLoad(res.body)
            const videoList = $('ul.product_list li')
                .toArray()
                .map((el) => {
                    const item = $(el).find('.product_info a').first()
                    const href = item.attr('href')
                    const title = item.text().trim()

                    return {
                        href: href ? NetHelper.joinUrl('https://www.mgstage.com/', href) : '',
                        title
                    }
                })
                .filter(
                    (item): item is { href: string; title: string } => !!item.href && !!item.title
                )

            loggerMsg.log(
                `搜索到${videoList.length}个视频作为候选项：`,
                url,
                videoList.map((item) => item.title)
            )

            // 找到最匹配的视频
            const match = EncodeHelper.bestMatch(
                searchTitle,
                videoList.map((item) => item.title)
            )
            if (!match) {
                loggerMsg.warn(`未找到匹配的视频`)
                return
            }

            const targetVideo = videoList[match.index]

            loggerMsg.log(
                `选择第 ${match.index + 1} 个视频: 【${targetVideo.title}】`,
                targetVideo.href
            )

            // 获取目标视频的webContent
            const re = await NetHelper.get(targetVideo.href, { signal })
            if (!re.ok) {
                loggerMsg.warn(`获取网页内容失败`)
                return
            }

            // 记录
            num.MGS = targetVideo.href.split(/[/\\]/).filter(Boolean).at(-1) || ''
            webContent.MGS = re.body

            loggerMsg.success(`获取到网页内容`)
        }

        // #endregion

        // #region FANZA网页内容获取
        async function numSearch(): Promise<boolean> {
            if (!num.Fanza) return false

            const res = await NetHelper.post(fanzaUrl, getNumBody(num.Fanza), {
                signal,
                parse: 'json',
                delay: 0
            })
            if (!res.ok) return false

            const content: NumResponse.PpvContent | null =
                (res.body as NumResponse.JSONSchema)?.data?.ppvContent || null
            if (!content) return false

            webContent.Fanza = content
            return true
        }

        async function getWebContentFanza(searchTitle: string) {
            // 先使用编号搜索
            if (num.Fanza) {
                const re = await numSearch()
                if (re) {
                    loggerFanza.success(`获取到视频内容`)
                    return
                }

                loggerFanza.log(`使用编号搜索失败，使用原标题搜索`)
            }

            // 如果编号搜索失败，则使用原标题搜索
            const res = await NetHelper.post(
                fanzaUrl,
                getTitleBody(remove大括号(searchTitle).split(/\s+/)[0]),
                {
                    signal,
                    parse: 'json',
                    delay: 0
                }
            )
            if (!res.ok) {
                loggerFanza.warn(`获取内容失败`)
                return
            }

            const contents: TitleResponse.Content[] | null =
                (res.body as TitleResponse.JSONSchema)?.data?.legacySearchPPV?.result?.contents ||
                null
            if (!contents || contents.length === 0) {
                loggerFanza.warn(`未找到匹配的视频`)
                return
            }

            loggerFanza.log(
                `搜索到${contents.length}个视频作为候选项：`,
                contents.map((item) => item.id)
            )

            // 找到最匹配的视频
            const match = EncodeHelper.bestMatch(
                searchTitle,
                contents.map((item) => item.title),
                80
            )
            if (!match) {
                loggerFanza.warn(`未找到匹配的视频`)
                return
            }

            const targetVideo = contents[match.index]

            loggerFanza.log(`选择第 ${match.index + 1} 个视频: ${targetVideo.id}`)

            // 再使用编号搜索
            num.Fanza = targetVideo.id

            const re = await numSearch()
            if (re) {
                loggerFanza.success(`获取到视频内容`)
                return
            }

            loggerFanza.warn(`获取内容失败`)
        }
        // #endregion

        /**
         * 获取大图和小图的链接到上下文中
         */
        function getPosterUrl() {
            if (image.smallImgUrl || image.bigImgUrl) return

            let smallImgUrl = ''
            let bigImgUrl = ''

            if (webContent.javDB) {
                const $ = cheerioLoad(webContent.javDB)
                bigImgUrl = $('.cover-container img.video-cover').attr('src') || ''
                smallImgUrl = bigImgUrl.replace('covers', 'thumbs')
            }

            if (webContent.jable) {
                const $ = cheerioLoad(webContent.jable)
                bigImgUrl =
                    $('.plyr__poster')
                        .attr('style')
                        ?.match(/https:.+\.jpg/)?.[0] || ''
            }

            if (webContent.MGS) {
                const $ = cheerioLoad(webContent.MGS)
                smallImgUrl = $('.detail_photo img.enlarge_image').attr('src') || ''
                bigImgUrl = $('p#package a').attr('href') || ''
            }

            image.smallImgUrl = smallImgUrl
            image.bigImgUrl = bigImgUrl
        }

        const getActor = DebugHelper.withMutex(async () => {
            if (actor) return true

            const $ = cheerioLoad(webContent.javDB)
            const actors = $('.movie-panel-info .panel-block')
                .filter((_, el) => $(el).find('strong').text().includes('演員'))
                .find('.value a')
                .toArray()
                .map((el) => {
                    const item = $(el)
                    const name = item.text().trim()
                    const gender = item.next().hasClass('male') ? 'male' : 'female'
                    const href = item.attr('href')?.trim()
                    return {
                        name,
                        gender,
                        href: href ? NetHelper.joinUrl('https://www.javdb.com/', href) : undefined
                    }
                })
                .filter(
                    (item): item is { href: string; name: string; gender: 'male' | 'female' } =>
                        !!item.href && !!item.name && !!item.gender
                )

            if (!actors.length) return false

            const actorObjs = actors.map((actor) => new Actor(actor.name, actor.gender))

            // 查询演员详情
            await Promise.all(
                actorObjs.map((actorObj, index) => actorObj.search(signal, actors[index].href))
            )
            if (signal.aborted) return false

            actor = actorObjs
            return true
        })

        return {
            // #region 刮削步骤
            async getWebContext() {
                if (webContent.javDB) {
                    logger.log('网页内容已获取过，跳过')
                    return true
                }

                num.javDB = video.num.javDB ?? ''
                num.jable = video.num.jable ?? ''
                num.MGS = video.num.MGS ?? ''
                num.Fanza = video.num.Fanza ?? ''

                // 把番号解析出来
                let { name = '', suffix = '' } =
                    video.title.match(/(?<name>[A-Z]+-\d+)(?:-?(?<suffix>CU|UC|C|U))?/i)?.groups ??
                    video.originaltitle.match(/(?<name>[A-Z]+-\d+)(?:-?(?<suffix>CU|UC|C|U))?/i)
                        ?.groups ??
                    video.sorttitle.match(/(?<name>[A-Z]+-\d+)(?:-?(?<suffix>CU|UC|C|U))?/i)
                        ?.groups ??
                    {}
                if (!name) {
                    logger.warn(`没有解析到正确的番号：`)
                    return false
                }

                name = name.toUpperCase()
                suffix = suffix.toUpperCase()

                if (suffix) _suffix = suffix
                logger.success(`成功解析番号：${name}${suffix ? `-${suffix}` : ''}`)

                // 获取webContent
                await Promise.all([getWebContentJavDB(name), getWebContentJable(name)])

                if (!webContent.javDB) return false

                // 获取Mgs和fanza
                const $ = cheerioLoad(webContent.javDB)
                const _title = $('.current-title').text().trim()
                if (_title) {
                    await Promise.all([getWebContentMgs(_title), getWebContentFanza(_title)])
                }

                return true
            },
            async parseTitle() {
                // 使用 EBWH-001-C 这样的格式
                const $ = cheerioLoad(webContent.javDB)
                let originaltitle = $('.movie-panel-info span.value')
                    .first()
                    .text()
                    .toLocaleUpperCase()
                    .trim()
                if (!originaltitle) return false

                // 加上后缀
                if (_suffix) originaltitle += `-${_suffix}`
                return originaltitle
            },
            async parseOriginaltitle() {
                const $ = cheerioLoad(webContent.javDB)
                let title = $('.current-title').text().trim()

                if (!title) return false

                // 翻译一下
                const re = await TransHelper.translate(remove大括号(title), false)
                if (re.ok) title = re.text

                return title
            },
            async parseSorttitle() {
                // 使用 EBWH-001 这样的格式
                const $ = cheerioLoad(webContent.javDB)
                const sorttitle = $('.movie-panel-info span.value')
                    .first()
                    .text()
                    .toLocaleUpperCase()
                    .trim()
                if (!sorttitle) return false

                return sorttitle
            },
            async parseTagline() {
                return null
            },
            async parseNum() {
                return {
                    javDB: num.javDB,
                    jable: num.jable,
                    MGS: num.MGS,
                    Fanza: num.Fanza
                }
            },
            async parseMpaa() {
                return 'JP-18+'
            },
            async parseRating() {
                const $ = cheerioLoad(webContent.javDB)
                const text = $('.movie-panel-info .score-stars').parent().text()
                const rating = text.match(/(?<rating>\d+(?:\.\d*)?)\s*分/)?.groups?.rating
                if (!rating) return false

                const number = toNumber(rating)
                if (isNaN(number)) return false

                return (number * 2).toString()
            },
            async parseDirector() {
                const $ = cheerioLoad(webContent.javDB)
                const director = $('.movie-panel-info .panel-block')
                    .filter((_, el) => $(el).find('strong').text().includes('導演'))
                    .find('.value')
                    .text()
                    .trim()

                if (!director) return false
                return director
            },
            async parseActor() {
                if (!(await getActor())) return false

                return actor!.map((actorObj) => ({
                    name: actorObj.name,
                    role: actorObj.role,
                    imgUrl: actorObj.imgUrl
                }))
            },
            async parseStudio() {
                const $ = cheerioLoad(webContent.javDB)
                const panelBlocks = $('.movie-panel-info .panel-block')

                let studio = panelBlocks
                    .filter((_, el) => $(el).find('strong').text().includes('發行'))
                    .find('.value')
                    .text()
                    .trim()

                // 没有發行时，回退使用片商
                if (!studio) {
                    studio = panelBlocks
                        .filter((_, el) => $(el).find('strong').text().includes('片商'))
                        .find('.value')
                        .text()
                        .trim()
                }

                if (!studio) return false
                return studio
            },
            async parseMaker() {
                const $ = cheerioLoad(webContent.javDB)
                const panelBlocks = $('.movie-panel-info .panel-block')

                let maker = panelBlocks
                    .filter((_, el) => $(el).find('strong').text().includes('片商'))
                    .find('.value')
                    .text()
                    .trim()

                // 没有片商时，回退使用發行
                if (!maker) {
                    maker = panelBlocks
                        .filter((_, el) => $(el).find('strong').text().includes('發行'))
                        .find('.value')
                        .text()
                        .trim()
                }

                if (!maker) return false
                return maker
            },
            async parseSet() {
                const $ = cheerioLoad(webContent.javDB)
                const set = $('.movie-panel-info .panel-block')
                    .filter((_, el) => $(el).find('strong').text().includes('系列'))
                    .find('.value')
                    .text()
                    .trim()

                if (!set) return false
                return set
            },
            async parseTag() {
                const tags: Set<string> = new Set()

                // jable
                if (webContent.jable) {
                    const $ = cheerioLoad(webContent.jable)
                    $('.tags a')
                        .filter((_, el) => !$(el).hasClass('cat'))
                        .toArray()
                        .map((el) => $(el).text().trim())
                        .filter((tag) => !!tag)
                        .forEach((tag) => tags.add(TransHelper.translateSC(tag)))
                }

                // javdb
                const $ = cheerioLoad(webContent.javDB)
                $('.movie-panel-info .panel-block')
                    .filter((_, el) => $(el).find('strong').text().includes('類別'))
                    .find('.value a')
                    .toArray()
                    .map((el) => $(el).text().trim())
                    .filter((tag) => !!tag)
                    .forEach((tag) => tags.add(TransHelper.translateSC(tag)))

                tags.delete('无码破解')
                return [...tags]
            },
            async parseGenre() {
                const genres: Set<string> = new Set()

                // jable
                if (webContent.jable) {
                    const $ = cheerioLoad(webContent.jable)
                    $('.tags a')
                        .filter((_, el) => $(el).hasClass('cat'))
                        .toArray()
                        .map((el) => $(el).text().trim())
                        .filter((genre) => !!genre)
                        .forEach((genre) => genres.add(TransHelper.translateSC(genre)))
                }

                // javdb
                const $ = cheerioLoad(webContent.javDB)
                $('.movie-panel-info .panel-block')
                    .filter((_, el) => $(el).find('strong').text().includes('類別'))
                    .find('.value a')
                    .toArray()
                    .map((el) => $(el).text().trim())
                    .filter((tag) => !!tag)
                    .forEach((tag) => genres.add(TransHelper.translateSC(tag)))

                genres.delete('无码破解')
                return [...genres]
            },
            async parsePlot() {
                let plot = ''

                // 从Mgs获取
                if (webContent.MGS) {
                    const $ = cheerioLoad(webContent.MGS)
                    const _plot = $('dl#introduction p')
                        .filter((_, el) => $(el).attr('id') !== 'introduction_all')
                        .text()
                        .trim()

                    plot += _plot
                } else if (webContent.Fanza) {
                    plot += EncodeHelper.decodeHtmlEntity(webContent.Fanza.description)
                }

                plot = remove大括号(plot).trim()

                // 翻译一下
                if (plot) plot = (await TransHelper.translate(plot)).text

                // 加上演员信息
                if (await getActor()) {
                    actor!.forEach((actor) => {
                        plot += actor.toString()
                    })
                }

                plot = plot.trim()

                if (plot.startsWith('----------------')) plot = plot.replace('----------------', '')
                plot = plot.trim()

                if (!plot) return false
                return plot
            },
            async parseYear() {
                const $ = cheerioLoad(webContent.javDB)
                const time = $('.movie-panel-info .panel-block')
                    .filter((_, el) => $(el).find('strong').text().includes('日期'))
                    .find('.value')
                    .text()
                    .trim()

                if (!time) return false
                return dayjs(time).year().toString()
            },
            async parsePremiered() {
                const $ = cheerioLoad(webContent.javDB)
                const time = $('.movie-panel-info .panel-block')
                    .filter((_, el) => $(el).find('strong').text().includes('日期'))
                    .find('.value')
                    .text()
                    .trim()

                if (!time) return false
                return dayjs(time).format('YYYY-MM-DD')
            },
            async parseReleasedate() {
                const $ = cheerioLoad(webContent.javDB)
                const time = $('.movie-panel-info .panel-block')
                    .filter((_, el) => $(el).find('strong').text().includes('日期'))
                    .find('.value')
                    .text()
                    .trim()

                if (!time) return false
                return dayjs(time).format('YYYY-MM-DD')
            },
            async parsePoster() {
                // 有Fanza直接用Fanza的
                if (webContent.Fanza) {
                    const posterUrl = webContent.Fanza.packageImage.mediumUrl

                    const posterPath = await ScraperHelper.downloadImage(
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
                    if (posterPath) {
                        logger.log(`下载图片成功！:${posterUrl}`)
                        return posterPath
                    }
                }

                // 从其他地方获取
                getPosterUrl()
                if (!image.bigImgUrl) return false

                const srcImagePath = await ScraperHelper.downloadImage(image.bigImgUrl, {
                    signal
                })
                if (!srcImagePath) return false

                // 默认直接使用大图
                if (!image.smallImgUrl) return srcImagePath

                // 有小图时，再使用模板匹配对大图进行裁剪
                const templImagePath = await ScraperHelper.downloadImage(image.smallImgUrl, {
                    signal
                })
                if (!templImagePath) return srcImagePath

                const result = await MediaHelper.templateMatchImage(srcImagePath, templImagePath)
                if (signal.aborted || !result) return srcImagePath

                // 保存裁剪后的图片到临时文件
                const path = await MediaHelper.saveTempImage(result.srcImageData.data, `poster`, {
                    crop: result.pos,
                    resize: {
                        maxWidth: posterScale.maxWidth,
                        maxHeight: posterScale.maxHeight,
                        minWidth: posterScale.minWidth,
                        minHeight: posterScale.minHeight
                    }
                })
                if (!path) return false

                return path
            },
            async parseThumb() {
                // 有Fanza直接用Fanza的
                if (webContent.Fanza) {
                    const thumbUrl = webContent.Fanza.packageImage.largeUrl

                    const thumbPath = await ScraperHelper.downloadImage(
                        thumbUrl,
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
                    if (thumbPath) {
                        logger.log(`下载图片成功！:${thumbUrl}`)
                        return thumbPath
                    }
                }

                // 从其他地方获取
                getPosterUrl()
                if (!image.bigImgUrl) return false

                const thumbPath = await ScraperHelper.downloadImage(
                    image.bigImgUrl,
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
                if (!thumbPath) return false

                return thumbPath
            },
            async parseFanart() {
                // 有Fanza直接用Fanza的
                if (webContent.Fanza) {
                    const fanartUrl = webContent.Fanza.packageImage.largeUrl

                    const fanartPath = await ScraperHelper.downloadImage(fanartUrl, {
                        signal
                    })
                    if (fanartPath) {
                        logger.log(`下载图片成功！:${fanartUrl}`)
                        return fanartPath
                    }
                }

                // 从其他地方获取
                getPosterUrl()
                if (!image.bigImgUrl) return false

                const fanartPath = await ScraperHelper.downloadImage(image.bigImgUrl, {
                    signal
                })
                if (!fanartPath) return false

                // 超分一下
                const re = await MediaHelper.superResolutionImage(fanartPath)
                if (!re) return false

                return re
            },
            async parseExtrafanart() {
                let extrafanarts: string[] = []

                // 有Fanza直接用Fanza的
                if (webContent.Fanza) {
                    const extrafanartUrls = webContent.Fanza.sampleImages.map(
                        (item) => item.largeImageUrl
                    )

                    extrafanarts = await ScraperHelper.downloadExtrafanart(extrafanartUrls, {
                        signal
                    })
                }

                // mgs
                if (!extrafanarts.length && webContent.MGS) {
                    const $ = cheerioLoad(webContent.MGS)
                    const extrafanartUrls = $('dl#sample-photo a.sample_image')
                        .toArray()
                        .map((item) => $(item).attr('href') || '')
                        .filter(Boolean)

                    extrafanarts = await ScraperHelper.downloadExtrafanart(extrafanartUrls, {
                        signal
                    })
                }

                // javdb
                if (!extrafanarts.length && webContent.javDB) {
                    const $ = cheerioLoad(webContent.javDB)
                    const extrafanartUrls = $('.tile-images.preview-images a.tile-item')
                        .toArray()
                        .map((item) => $(item).attr('href') || '')
                        .filter(Boolean)

                    extrafanarts = await ScraperHelper.downloadExtrafanart(extrafanartUrls, {
                        signal
                    })
                }

                // 总汇
                if (!extrafanarts.length) return false

                return extrafanarts
            },
            async parseOutput(): Promise<{ dir: string; fileName: string }> {
                let actor = ''

                if (video.actor.length > 1) actor = '多人'
                if (video.actor.length === 1) actor = video.actor[0].name

                const dir = `${actor}/${video.sorttitle}`
                return { dir, fileName: video.title }
            }
            // #endregion
        }
    }
)

export default useScraper

function remove大括号(text: string) {
    return text.replaceAll(/【[^】]*】/g, '')
}
