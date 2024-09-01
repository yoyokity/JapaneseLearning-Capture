import { load as cheerioLoad } from 'cheerio'

import Scraper from '../scraper/Scraper.js'
import Video from '../scraper/Video.js'
import Session from '../scraper/tool/session.js'
import translate from '../scraper/tool/translator.js'
import Actor from '../scraper/Actor.js'

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Upgrade-Insecure-Requests': '1',
    'Referer': 'https://javdb.com/',
}
const cookie = {
    'over18': '1', 'locale': 'zh'
}

class JavDB extends Scraper {
    session = new Session('https://javdb.com/', headers, cookie)

    /**
     * 注册一个刮削器，一个刮削器对应一个影片
     * @param {Video} video
     */
    constructor (video) {
        super(video)
    }

    async checkConnect () {
        let response = await this.session.get('')
        if (response) {
            return true
        }
        return null
    }

    getDirectory (outputPath) {
        return `${outputPath}\\${this.video.title}`
    }

    async searchPage (video) {
        const search_url = `search?q=${this.video.title}&f=all`
        const response = await this.session.get(search_url)

        if (!response.status) { return null }
        const $ = cheerioLoad(response.data)

        const jav_number = $('.video-title strong').first().text()
        if (jav_number === '') { return null }

        if (this.video.title.includes(jav_number) || jav_number.includes(this.video.title)) {
            const url = $('a.box').attr().href
            const response = await this.session.get(url)
            if (response) {
                return response.data
            }
        }

        return null
    }

    async title (page) {
        /** @type {string|null} */
        this._jav_number = getInfoText(page, '番號')

        if (!this._jav_number) {
            const $ = cheerioLoad(page)
            this._jav_number = $('h2.title strong').first().text() || null
        }

        this._jav_number = this._jav_number.trim()
        return this._jav_number
    }

    async originaltitle (page) {
        const $ = cheerioLoad(page)
        this._originaltitle = $('h2.title strong').last().text() || null
        return this._originaltitle
    }

    async sorttitle (page) {
        return this._jav_number
    }

    async tagline (page) {
        return ''
    }

    async num (page) {
        return this._jav_number
    }

    async mpaa (page) {
        return 'JP-18+'
    }

    async rating (page) {
        const text = getInfoText(page, '評分')
        const match = text.match(/[\d.]+/)
        return match ? (Number(match[0]) * 2).toString() : null
    }

    async director (page) {
        return getInfoText(page, '導演')
    }

    async actor (page) {
        const $ = cheerioLoad(page)
        const div = getInfo(page, '演員')
        if (div) {
            /** @type {Map<string, Actor>} */
            const actors = new Map()

            div.find('a').each((index, element) => {
                    let actor = new Actor()

                    actor.name = $(element).text()
                    actor.url = $(element).attr().href
                    const genderSymbol = $(element).next('strong').text()

                    if (genderSymbol === '♀') {
                        actor.gender = 'female'
                    } else if (genderSymbol === '♂') {
                        actor.gender = 'male'
                    }

                    actors.set(actor.name, actor)
                }
            )

            //搜索其余属性
            for (const [name, actor] of actors.entries()) {
                if (actor.gender !== 'female') continue  //忽略男人
                const newActor = await this.searchActor(actor, actor.url)
                actors.set(name, newActor)
            }

            /** @type {Map<string,Actor>} */
            this._actors = actors
            return actors
        }

        this._actors = null
        return null
    }

    async maker (page) {
        this._maker = getInfoText(page, '片商')
        return this._maker
    }

    async studio (page) {
        const text = getInfoText(page, '發行')
        return text || this._maker
    }

    async set (page) {
        const text = getInfoText(page, '系列')
        return text || this._maker
    }

    async tag (page) {
        const $ = cheerioLoad(page)
        const div = getInfo(page, '類別')

        if (div) {
            let tagList = []
            div.find('a').each((index, element) => {
                let tag = $(element).text()
                tag = translate.translateSC(tag) //翻译为简体
                tagList.push(tag)
            })

            this._tag = tagList
            return tagList
        }

        this._tag = null
        return null
    }

    async genre (page) {
        return this._tag
    }

    async plot (page) {
        let text = await translate.translate(this._originaltitle) || ''
        //添加演员信息
        for (const actor of this._actors.values()) {
            if (actor.gender !== 'female') continue
            text = text + '\n\n' + actor.infoText()
        }

        return text
    }

    async year (page) {
        const text = getInfoText(page, '日期')
        this._date = text

        const match = text.match(/(\d{4})/)
        return match ? match[0] : null
    }

    async premiered (page) {
        return this._date
    }

    async releasedate (page) {
        return this._date
    }

    async downloadImage (page, directory, extrafanartPath) {
        // 封面
        // 封面用别的，javdb有水印，不行
        let session = new Session('https://eightcha.com/')
        let img = await session.getImage(`${this._jav_number.toLowerCase()}/cover.jpg`)

        if (img) {
            img.save(`${directory}\\poster.jpg`)
            img.save(`${directory}\\thumb.jpg`)
            await img.realesrgan()
            await img.save(`${directory}\\fanart.jpg`)
        } else return false

        // 剧照
        const $ = cheerioLoad(page)
        const hrefs = []

        const tileItems = $('.tile-images.preview-images .tile-item')
        tileItems.each((index, element) => {
            const href = $(element).attr('href')
            if (href) {
                hrefs.push(href)
            }
        })

        let index = 0
        for (const href of hrefs) {
            index++
            let img = await this.session.getImage(href)
            if (img) {
                img.save(`${extrafanartPath}\\extrafanart-${index}.jpg`)
            }
        }

        return true
    }

    /**
     * @private
     * @param {Actor} actor
     * @param {string} url
     * @return {Promise<Actor>}
     */
    async searchActor (actor, url) {
        delete actor.url

        //检查数据库中是否已有演员信息
        let _actor = Actor.get(actor.name)
        if (_actor) {
            return _actor
        }

        //从wiki获取基本信息
        let session = new Session('https://ja.wikipedia.org/')
        let response = await session.get(`wiki/${encodeURIComponent(actor.name)}`)
        if (response) {
            const $ = cheerioLoad(response.data)
            const infobox = $('.infobox')
            if (infobox) {
                const text = infobox.text()

                const birthdate = text.match(/\d{4}年\d+月\d+日/)?.[0]
                if (birthdate) {
                    actor.birthdate = birthdate.trim()
                }

                const measurements = text.match(/[\d ]+-[\d ]+-[\d ]+cm/)?.[0]
                if (measurements) {
                    actor.measurements = measurements.trim().replace(' ','')
                }
                const cup = text.match(/[A-Z]\n/)?.[0]
                if (cup) {
                    actor.cup = cup.trim()
                }
            }
        }

        //使用javdb自带的头像
        response = await this.session.get(url)
        if (response) {
            const $ = cheerioLoad(response.data)
            const elements = $('.column.actor-avatar')
            if (elements.length > 0) {
                let url = elements.html().match(/https:.+\.jpg/)?.[0]
                if (url) {
                    actor.imgUrl = url
                }
            }
        }

        Actor.set(actor)
        return actor
    }
}

/**
 * 获取页面的信息，获取不到则返回null
 * @param {string} page
 * @param {string} key 关键字
 * @return {string|null} 返回文本
 */
function getInfoText (page, key) {
    const $ = cheerioLoad(page)
    let re = null
    $('.panel.movie-panel-info').children().each((index, element) => {
        if ($(element).text().includes(key)) {
            re = $(element).find($('span.value')).text()
            return false
        }
    })

    return re
}

/**
 * 获取页面的信息，获取不到则返回null
 * @param {string} page
 * @param {string} key 关键字
 * @return {import('cheerio').Cheerio<Element>} 返回Cheerio对象
 */
function getInfo (page, key) {
    const $ = cheerioLoad(page)
    let re = null
    $('.panel.movie-panel-info').children().each((index, element) => {
        if ($(element).text().includes(key)) {
            re = $(element).find($('span.value'))
            return false
        }
    })

    return re
}

export default JavDB