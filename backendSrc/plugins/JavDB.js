import { load as cheerioLoad } from 'cheerio'

import { Scraper } from '../scraper/Scraper.js'
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
        let re = await Actor.checkConnect()
        if (re !== true) {
            return re
        }
        return true
    }

    getDirectory (outputPath) {
        let actors = this._actors

        let females = []
        actors.forEach(actor => {
            if (actor.gender === 'female') {
                females.push(actor)
            }
        })

        let name = null
        if (females.length === 0) {
            return `${outputPath}\\${this.video.title}`
        }
        if (females.length > 1) {
            name = '多人合作'
        } else {
            name = females[0].name
        }
        return `${outputPath}\\${name}\\${this.video.title}`
    }

    async searchPage (video) {
        const search_url = `search?q=${video.title}&f=all`
        const response = await this.session.get(search_url)

        if (!response) { return null }
        const $ = cheerioLoad(response)

        let div = $('a.box').filter((i, el) => {
            let jav_number = $(el).find('.video-title strong').text().trim()
            if (jav_number === '') { return false }
            return !!(video.title.includes(jav_number) || jav_number.includes(video.title))
        })

        if (div.length > 0) {
            const url = $(div).attr().href
            const response = await this.session.get(url)
            if (response) {
                return response
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

            for (const element of div.find('a')) {
                let actor = new Actor($(element).text())

                let url = $(element).attr().href
                let gender = null
                const genderSymbol = $(element).next('strong').text()
                if (genderSymbol === '♀') {
                    gender = 'female'
                } else if (genderSymbol === '♂') {
                    gender = 'male'
                }
                await actor.search(url, gender === 'female')
                actors.set(actor.name, actor)
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
        let text = await translate.translate(this._originaltitle) || this._originaltitle
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

        if (!img) {
            //没有就用javdb的
            const $ = cheerioLoad(page)
            const url = $('.video-meta-panel').find('img').attr('src')
            img = await session.getImage(url)
        }

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