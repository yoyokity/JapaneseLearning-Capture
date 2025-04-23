import { load as cheerioLoad } from 'cheerio'

import { Scraper } from '../scraper/Scraper.js'
import Session from '../scraper/tool/session.js'
import Actor from '../scraper/Actor.js'
import translate from '../scraper/tool/translator.js'

const headers = {
    'Referer': 'https://www.giga-web.jp/top.php',
}

class GIGA extends Scraper {
    session = new Session('https://www.giga-web.jp/', headers)

    async actor (page) {
        const $ = cheerioLoad(page)
        let actors = new Map()

        let a = this.parseWorksText('出演女優').find('a')
        for (const element of a) {
            let name = $(element).text().trim()
            let actor = new Actor(name)
            await actor.search()
            actors.set(name, actor)
        }

        this._actors = actors
        return actors
    }

    async checkConnect () {
        let re = await Actor.checkConnect()
        if (re !== true) {
            return re
        }

        re = await this.session.ping()
        if (!re) {
            return 'giga'
        }

        return true
    }

    constructor (video) {
        super(video)
    }

    async searchPage (video) {
        //获取cookie
        let newCookie = await this.session.getCookie('cookie_set.php', null)
        if (!newCookie) { return null }

        this.session = new Session('https://www.giga-web.jp/', headers, {
            'PHPSESSID': newCookie.PHPSESSID,
            'old_check': 'yes', 'layout': 'jpn',
            'WSLB': newCookie.WSLB
        })

        //搜索页面
        let search_url = `search/?keyword=${video.title}`
        let response = await this.session.get(search_url)
        if (response.includes('あなたは18歳以上ですか？')) {
            console.warn('18岁页面不过')
            return null
        }
        if (!response) { return null }

        let $ = cheerioLoad(response)
        const targetDiv = $('.search_sam_box').filter((i, el) => {
            return $(el)?.text().includes(video.title)
        })?.first()

        if (targetDiv.length > 0) {
            let href = targetDiv.find('a').first().attr('href')

            //影片页面
            response = await this.session.get(href)
            if (!response) { return null }

            this._page = response
            return response
        }

        return null
    }

    async director (page) {
        return this.parseWorksText('監督').text().trim()
    }

    async downloadImage (page, directory, extrafanartPath) {
        const $ = cheerioLoad(page)

        // 封面
        let url = $('#works_pic').find('img').attr('src')
        let img = await this.session.getImage(url)

        if (img) {
            img.save(`${directory}\\poster.jpg`)
            img.save(`${directory}\\thumb.jpg`)
            await img.realesrgan()
            await img.save(`${directory}\\fanart.jpg`)
        } else return false

        //剧照
        let hrefs = $('.gasatsu_images_pc').find('img').map(function () {
            return $(this).attr('src')
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

    async genre (page) {
        return this._tags
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

    async maker (page) {
        return 'GIGA'
    }

    async mpaa (page) {
        return 'JP-18+'
    }

    async num (page) {
        return this._title
    }

    async originaltitle (page) {
        let $ = cheerioLoad(page)
        return $('h5').text().trim()
    }

    async plot (page) {
        let $ = cheerioLoad(page)
        let div = $('#story_list2')
        if (div.length === 0) {
            div = $('#story_list1')
        }
        
        if (div.length === 0) {
            return null
        }

        let text = div.find('li.story_window')[0].firstChild.data.trim()
        text = await translate.translate(text) || text
        //添加演员信息
        for (const actor of this._actors.values()) {
            if (actor.gender !== 'female') continue
            text = text + '\n\n' + actor.infoText()
        }

        return text
    }

    async premiered (page) {
        return this._date
    }

    async rating (page) {
        return null
    }

    async releasedate (page) {
        return this._date
    }

    async set (page) {
        return null
    }

    async sorttitle (page) {
        return this._title
    }

    async studio (page) {
        return 'GIGA'
    }

    async tag (page) {
        this._tags = []
        let $ = cheerioLoad(page)
        $('#tag_main').find('a').each((i, el) => {
            this._tags.push($(el).text().trim())
        })

        //翻译
        this._tags = [...new Set(this._tags)]
        let text = this._tags.join('\n')
        text = await translate.translate(text) || text
        this._tags = text.split('\n')

        return this._tags
    }

    async tagline (page) {
        return null
    }

    async title (page) {
        let t = this.parseWorksText('作品番号').text().trim()
        this._title = t
        return t
    }

    async year (page) {
        let text = this.parseWorksText('リリース日').text().trim()
        if (text) {
            this._date = text.replaceAll('/', '-')
            return text.slice(0, 4)
        }

        this._date = null
        return null
    }

    /**
     * @param {string} label
     */
    parseWorksText (label) {
        let $ = cheerioLoad(this._page)
        return $('#works_txt').find('dt').filter((i, el) => {
            return $(el)?.text().includes(label)
        }).next()
    }
}

export default GIGA