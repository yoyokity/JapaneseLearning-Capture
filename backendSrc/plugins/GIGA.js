import { load as cheerioLoad } from 'cheerio'

import { Scraper } from '../scraper/Scraper.js'
import Session from '../scraper/tool/session.js'
import Actor from '../scraper/Actor.js'

const headers = {
    'Referer': 'https://www.giga-web.jp/top.php',
}

class GIGA extends Scraper {
    session = new Session('https://www.giga-web.jp/', headers)

    async actor (page) {
        let name = this.parseWorksText('出演女優').text().trim()
        let actor = new Actor()
        actor.name = name
        actor.gender = 'female'


        return
    }

    async checkConnect () {
        let response = await this.session.get('')
        if (response) {
            return true
        }
        return null
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
        if (response.includes('あなたは18歳以上ですか？')){
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
        return Promise.resolve(false)
    }

    async genre (page) {
        this._tags = []
        let $ = cheerioLoad(page)
        $('#tag_main').find('a').each((i, el) => {
            this._tags.push($(el).text().trim())
        })
        return this._tags
    }

    getDirectory (outputPath) {
        return `${outputPath}\\${this.video.title}`
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
        let  $ = cheerioLoad(page)
        return $('h5').text().trim()
    }

    async plot (page) {
        return Promise.resolve('')
    }

    async premiered (page) {
        return Promise.resolve('')
    }

    async rating (page) {
        return null
    }

    async releasedate (page) {
        return Promise.resolve('')
    }

    async set (page) {
        return Promise.resolve('')
    }

    async sorttitle (page) {
        return this._title
    }

    async studio (page) {
        return Promise.resolve('')
    }

    async tag (page) {
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
        return Promise.resolve('')
    }

    /**
     * @param {string} label
     */
    parseWorksText(label){
        let $ = cheerioLoad(this._page)
        return $('#works_txt').find('dt').filter((i, el) => {
            return $(el)?.text().includes(label)
        }).next()
    }
}

export default GIGA