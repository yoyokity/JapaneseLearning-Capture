import type { IAvContext } from '@renderer/plugins/AV/type'
import type { IScraper, IVideo } from '@renderer/scraper'

import {
    EncodeHelper,
    MediaHelper,
    NetHelper,
    posterScale,
    thumbScale,
    TransHelper
} from '@renderer/helper'
import { getWebContentFanza } from '@renderer/plugins/AV/fanza'
import { getWebContentJable } from '@renderer/plugins/AV/jable'
import { getWebContentJavDB } from '@renderer/plugins/AV/javDB'
import { getWebContentMgs } from '@renderer/plugins/AV/mgs'
import { logger, scraperName } from '@renderer/plugins/AV/type'
import { Actor, Scraper } from '@renderer/scraper'
import { load as cheerioLoad } from 'cheerio'
import dayjs from 'dayjs'
import { isNaN, toNumber } from 'es-toolkit/compat'

const avScraper: IScraper<IAvContext> = {
    scraperName,
    checkConnect: async () => {
        return true
    },
    numSource: {
        JavDB: 'https://javdb.com/v/{num}',
        Jable: 'https://www.jable.com/videos/{num}',
        Mgs: 'https://www.mgstage.com/product/product_detail/{num}',
        Fanza: 'https://video.dmm.co.jp/av/content/?id={num}&i3_ref=search&i3_ord=1&i3_pst=1&dmmref=video_search'
    },
    createContext(): IAvContext {
        return {
            num: {
                JavDB: '',
                jable: '',
                mgs: '',
                fanza: ''
            },
            webContent: {
                JavDB: '',
                jable: '',
                mgs: '',
                fanza: null
            },
            originaltitle: '',
            maker: '',
            tag: [],
            suffix: '',
            actor: [],
            image: {
                smallImgUrl: '',
                bigImgUrl: ''
            }
        }
    },
    scraperVideoFuncs: {
        async getWebContext(
            video: IVideo,
            context: IAvContext,
            signal: AbortSignal
        ): Promise<boolean> {
            if (context.webContent.JavDB) {
                logger.log('网页内容已获取过，跳过')
                return true
            }

            const title = video.originaltitle || video.title || video.sorttitle
            context.num.JavDB = video.num.JavDB ?? ''
            context.num.jable = video.num.jable ?? ''

            // 把番号解析出来
            let { name = '', suffix = '' } =
                title.match(/(?<name>[A-Z]+-\d+)(?:-?(?<suffix>CU|UC|C|U))?/i)?.groups ?? {}
            if (!name) {
                logger.warn(`没有解析到正确的番号：`, title)
                return false
            }

            name = name.toUpperCase()
            suffix = suffix.toUpperCase()

            if (suffix) context.suffix = suffix
            logger.success(`成功解析番号：${name}-${suffix}`)

            // 获取webContent
            await Promise.all([
                getWebContentJavDB(name, context, signal),
                getWebContentJable(name, context, signal)
            ])

            if (!context.webContent.JavDB) return false

            // 获取Mgs和fanza
            const $ = cheerioLoad(context.webContent.JavDB)
            const _title = $('.current-title').text().trim()
            if (_title) {
                await Promise.all([
                    getWebContentMgs(_title, context, signal),
                    getWebContentFanza(_title, context, signal)
                ])
            }

            return true
        },
        async parseTitle(video: IVideo, context: IAvContext): Promise<boolean | null> {
            const $ = cheerioLoad(context.webContent.JavDB)
            let title = $('.current-title').text().trim()

            if (!title) return false

            // 翻译一下
            const re = await TransHelper.translate(title, false)
            if (re.ok) title = re.text

            // 如果文本前面有【xxx】则去掉【xxx】
            title = title.replace(/^【[^】]*】\s*/, '')

            video.title = title
            return true
        },
        async parseOriginaltitle(video: IVideo, context: IAvContext): Promise<boolean | null> {
            // 原始标题使用 EBWH-001-C 这样的格式
            const $ = cheerioLoad(context.webContent.JavDB)
            let originaltitle = $('.movie-panel-info span.value')
                .first()
                .text()
                .toLocaleUpperCase()
                .trim()
            if (!originaltitle) return false

            // 加上后缀
            if (context.suffix) originaltitle += `-${context.suffix}`

            context.originaltitle = originaltitle
            video.originaltitle = originaltitle
            return true
        },
        async parseSorttitle(
            video: IVideo,
            context: IAvContext,
            signal: AbortSignal
        ): Promise<boolean | null> {
            if (!context.originaltitle) {
                if (
                    !(await avScraper.scraperVideoFuncs.parseOriginaltitle(video, context, signal))
                ) {
                    return false
                }
            }

            video.sorttitle = context.originaltitle
            return true
        },
        async parseTagline(): Promise<boolean | null> {
            return null
        },
        async parseNum(video: IVideo, context: IAvContext): Promise<boolean | null> {
            if (context.num.JavDB) video.num.JavDB = context.num.JavDB
            if (context.num.jable) video.num.jable = context.num.jable
            return true
        },
        async parseMpaa(video: IVideo): Promise<boolean | null> {
            video.mpaa = 'JP-18+'
            return true
        },
        async parseRating(video: IVideo, context: IAvContext): Promise<boolean | null> {
            const $ = cheerioLoad(context.webContent.JavDB)
            const text = $('.movie-panel-info .score-stars').parent().text()
            const rating = text.match(/(?<rating>\d+(?:\.\d*)?)\s*分/)?.groups?.rating
            if (!rating) return false

            const number = toNumber(rating)
            if (isNaN(number)) return false

            video.rating = (number * 2).toString()
            return true
        },
        async parseDirector(video: IVideo, context: IAvContext): Promise<boolean | null> {
            const $ = cheerioLoad(context.webContent.JavDB)
            const director = $('.movie-panel-info .panel-block')
                .filter((_, el) => $(el).find('strong').text().includes('導演'))
                .find('.value')
                .text()
                .trim()

            if (!director) return false

            video.director = director
            return true
        },
        async parseActor(
            video: IVideo,
            context: IAvContext,
            signal: AbortSignal
        ): Promise<boolean | null> {
            const $ = cheerioLoad(context.webContent.JavDB)
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

            // 写入演员信息
            context.actor = actorObjs
            video.actor = actorObjs.map((actorObj) => ({
                name: actorObj.name,
                role: actorObj.role,
                imgUrl: actorObj.imgUrl
            }))

            return true
        },
        async parseStudio(video: IVideo, context: IAvContext): Promise<boolean | null> {
            const $ = cheerioLoad(context.webContent.JavDB)
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

            video.studio = studio
            return true
        },
        async parseMaker(video: IVideo, context: IAvContext): Promise<boolean | null> {
            const $ = cheerioLoad(context.webContent.JavDB)
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

            video.maker = maker
            return true
        },
        async parseSet(video: IVideo, context: IAvContext): Promise<boolean | null> {
            const $ = cheerioLoad(context.webContent.JavDB)
            const set = $('.movie-panel-info .panel-block')
                .filter((_, el) => $(el).find('strong').text().includes('系列'))
                .find('.value')
                .text()
                .trim()

            if (!set) return false

            video.set = set
            return true
        },
        async parseTag(video: IVideo, context: IAvContext): Promise<boolean | null> {
            const tags: Set<string> = new Set()

            // jable
            if (context.webContent.jable) {
                const $ = cheerioLoad(context.webContent.jable)
                $('.tags a')
                    .filter((_, el) => !$(el).hasClass('cat'))
                    .toArray()
                    .map((el) => $(el).text().trim())
                    .filter((tag) => !!tag)
                    .forEach((tag) => tags.add(TransHelper.translateSC(tag)))
            }

            // javdb
            const $ = cheerioLoad(context.webContent.JavDB)
            $('.movie-panel-info .panel-block')
                .filter((_, el) => $(el).find('strong').text().includes('類別'))
                .find('.value a')
                .toArray()
                .map((el) => $(el).text().trim())
                .filter((tag) => !!tag)
                .forEach((tag) => tags.add(TransHelper.translateSC(tag)))

            video.tag = [...tags]
            return true
        },
        async parseGenre(video: IVideo, context: IAvContext): Promise<boolean | null> {
            const genres: Set<string> = new Set()

            // jable
            if (context.webContent.jable) {
                const $ = cheerioLoad(context.webContent.jable)
                $('.tags a')
                    .filter((_, el) => $(el).hasClass('cat'))
                    .toArray()
                    .map((el) => $(el).text().trim())
                    .filter((genre) => !!genre)
                    .forEach((genre) => genres.add(TransHelper.translateSC(genre)))
            }

            // javdb
            const $ = cheerioLoad(context.webContent.JavDB)
            $('.movie-panel-info .panel-block')
                .filter((_, el) => $(el).find('strong').text().includes('類別'))
                .find('.value a')
                .toArray()
                .map((el) => $(el).text().trim())
                .filter((tag) => !!tag)
                .forEach((tag) => genres.add(TransHelper.translateSC(tag)))

            video.genre = [...genres]
            return true
        },
        async parsePlot(video: IVideo, context: IAvContext): Promise<boolean | null> {
            let plot = ''

            // 从Mgs获取
            if (context.webContent.mgs) {
                const $ = cheerioLoad(context.webContent.mgs)
                const _plot = $('dl#introduction p')
                    .filter((_, el) => !$(el).hasClass('.more'))
                    .text()
                    .trim()
                plot += TransHelper.translate(_plot)
                plot += '\n\n'
            } else if (context.webContent.fanza) {
                plot += TransHelper.translate(
                    EncodeHelper.decodeHtmlEntity(context.webContent.fanza.description)
                )
                plot += '\n\n'
            }

            // 加上演员信息
            context.actor.forEach((actor) => {
                plot += actor.toString()
            })

            if (!plot) return false

            video.plot = plot.trim()
            return true
        },
        async parseYear(video: IVideo, context: IAvContext): Promise<boolean | null> {
            const $ = cheerioLoad(context.webContent.JavDB)
            const time = $('.movie-panel-info .panel-block')
                .filter((_, el) => $(el).find('strong').text().includes('日期'))
                .find('.value')
                .text()
                .trim()

            if (!time) return false

            video.year = dayjs(time).year().toString()
            return true
        },
        async parsePremiered(video: IVideo, context: IAvContext): Promise<boolean | null> {
            const $ = cheerioLoad(context.webContent.JavDB)
            const time = $('.movie-panel-info .panel-block')
                .filter((_, el) => $(el).find('strong').text().includes('日期'))
                .find('.value')
                .text()
                .trim()

            if (!time) return false

            video.premiered = dayjs(time).format('YYYY-MM-DD')
            return true
        },
        async parseReleasedate(video: IVideo, context: IAvContext): Promise<boolean | null> {
            const $ = cheerioLoad(context.webContent.JavDB)
            const time = $('.movie-panel-info .panel-block')
                .filter((_, el) => $(el).find('strong').text().includes('日期'))
                .find('.value')
                .text()
                .trim()

            if (!time) return false

            video.premiered = dayjs(time).format('YYYY-MM-DD')
            return true
        },
        async parsePoster(
            video: IVideo,
            context: IAvContext,
            signal: AbortSignal
        ): Promise<boolean | null> {
            // 有fanza直接用fanza的
            if (context.webContent.fanza) {
                const posterUrl = context.webContent.fanza.packageImage.mediumUrl

                const posterPath = await Scraper.downloadImage(
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
                    video.poster = posterPath
                    return true
                }
            }

            // 从其他地方获取
            getPosterUrl(context)
            if (!context.image.bigImgUrl) return false

            const srcImagePath = await Scraper.downloadImage(context.image.bigImgUrl, {
                signal
            })
            if (!srcImagePath) return false

            // 默认直接使用大图
            video.poster = srcImagePath
            if (!context.image.smallImgUrl) return true

            // 有小图时，再使用模板匹配对大图进行裁剪
            const templImagePath = await Scraper.downloadImage(context.image.smallImgUrl, {
                signal
            })
            if (!templImagePath) return true

            const result = await MediaHelper.templateMatchIamge(srcImagePath, templImagePath)
            if (signal.aborted || !result) return true

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

            video.poster = path
            return true
        },
        async parseThumb(
            video: IVideo,
            context: IAvContext,
            signal: AbortSignal
        ): Promise<boolean | null> {
            // 有fanza直接用fanza的
            if (context.webContent.fanza) {
                const thumbUrl = context.webContent.fanza.packageImage.largeUrl

                const thumbPath = await Scraper.downloadImage(
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
                    video.thumb = thumbPath
                    return true
                }
            }

            // 从其他地方获取
            getPosterUrl(context)
            if (!context.image.bigImgUrl) return false

            const thumbPath = await Scraper.downloadImage(
                context.image.bigImgUrl,
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

            video.thumb = thumbPath
            return true
        },
        async parseFanart(
            video: IVideo,
            context: IAvContext,
            signal: AbortSignal
        ): Promise<boolean | null> {
            // 有fanza直接用fanza的
            if (context.webContent.fanza) {
                const fanartUrl = context.webContent.fanza.packageImage.largeUrl

                const fanartPath = await Scraper.downloadImage(fanartUrl, {
                    signal
                })
                if (fanartPath) {
                    logger.log(`下载图片成功！:${fanartUrl}`)
                    video.fanart = fanartPath
                    return true
                }
            }

            // 从其他地方获取
            getPosterUrl(context)
            if (!context.image.bigImgUrl) return false

            const fanartPath = await Scraper.downloadImage(context.image.bigImgUrl, {
                signal
            })
            if (!fanartPath) return false

            // 超分一下
            const re = await MediaHelper.superResolutionImage(fanartPath)
            if (!re) return false

            video.fanart = re
            return true
        },
        async parseExtrafanart(
            video: IVideo,
            context: IAvContext,
            signal: AbortSignal
        ): Promise<boolean | null> {
            let extrafanarts: string[] = []

            // 有fanza直接用fanza的
            if (context.webContent.fanza) {
                const extrafanartUrls = context.webContent.fanza.sampleImages.map(
                    (item) => item.largeImageUrl
                )

                extrafanarts = await Scraper.downloadExtrafanart(extrafanartUrls, {
                    signal
                })
            }

            // mgs
            if (!extrafanarts.length && context.webContent.mgs) {
                const $ = cheerioLoad(context.webContent.mgs)
                const extrafanartUrls = $('dl#sample-photo a.sample_image')
                    .toArray()
                    .map((item) => $(item).attr('href') || '')
                    .filter(Boolean)

                extrafanarts = await Scraper.downloadExtrafanart(extrafanartUrls, {
                    signal
                })
            }

            // javdb
            if (!extrafanarts.length && context.webContent.JavDB) {
                const $ = cheerioLoad(context.webContent.JavDB)
                const extrafanartUrls = $('.tile-images.preview-images a.tile-item')
                    .toArray()
                    .map((item) => $(item).attr('href') || '')
                    .filter(Boolean)

                extrafanarts = await Scraper.downloadExtrafanart(extrafanartUrls, {
                    signal
                })
            }

            // 总汇
            if (!extrafanarts.length) return false

            video.extrafanart = extrafanarts
            return true
        },
        async parseOutput(video: IVideo): Promise<{ dir: string; fileName: string }> {
            let actor = ''

            if (video.actor.length > 1) actor = '多人'
            if (video.actor.length === 1) actor = video.actor[0].name

            const dir = `${actor}/${video.originaltitle}`
            return { dir, fileName: video.originaltitle }
        }
    }
}

export default avScraper

/**
 * 获取大图和小图的链接到上下文中
 */
function getPosterUrl(context: IAvContext) {
    if (context.image.smallImgUrl || context.image.bigImgUrl) return

    let smallImgUrl = ''
    let bigImgUrl = ''

    if (context.webContent.JavDB) {
        const $ = cheerioLoad(context.webContent.JavDB)
        bigImgUrl = $('.cover-container img.video-cover').attr('src') || ''
        smallImgUrl = bigImgUrl.replace('covers', 'thumbs')
    }

    if (context.webContent.jable) {
        const $ = cheerioLoad(context.webContent.jable)
        bigImgUrl =
            $('.plyr__poster')
                .attr('style')
                ?.match(/https:.+\.jpg/)?.[0] || ''
    }

    if (context.webContent.mgs) {
        const $ = cheerioLoad(context.webContent.mgs)
        smallImgUrl = $('.detail_photo img.enlarge_image').attr('src') || ''
        bigImgUrl = $('p#package a').attr('href') || ''
    }

    context.image = {
        smallImgUrl,
        bigImgUrl
    }
}
