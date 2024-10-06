import { load as cheerioLoad } from 'cheerio'

import { Scraper } from '../scraper/Scraper.js'
import Video from '../scraper/Video.js'
import Session from '../scraper/tool/session.js'
import translate from '../scraper/tool/translator.js'
import Actor from '../scraper/Actor.js'

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Upgrade-Insecure-Requests': '1',
    'Referer': 'https://www.giga-web.jp/top.php',
}
const cookie = {
    'old_check': 'yes', 'layout': 'jpn'
}

class GIGA extends Scraper {
    session = new Session('https://www.giga-web.jp/', headers, cookie)

    async actor (page) {
        return Promise.resolve(undefined)
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

    async director (page) {
        return Promise.resolve('')
    }

    async downloadImage (page, directory, extrafanartPath) {
        return Promise.resolve(false)
    }

    async genre (page) {
        return Promise.resolve([])
    }

    getDirectory (outputPath) {
        return `${outputPath}\\${this.video.title}`
    }

    async maker (page) {
        return Promise.resolve('')
    }

    async mpaa (page) {
        return Promise.resolve('')
    }

    async num (page) {
        return Promise.resolve('')
    }

    async originaltitle (page) {
        return Promise.resolve('')
    }

    async plot (page) {
        return Promise.resolve('')
    }

    async premiered (page) {
        return Promise.resolve('')
    }

    async rating (page) {
        return Promise.resolve('')
    }

    async releasedate (page) {
        return Promise.resolve('')
    }

    async searchPage (video) {
        return Promise.resolve('')
    }

    async set (page) {
        return Promise.resolve('')
    }

    async sorttitle (page) {
        return Promise.resolve('')
    }

    async studio (page) {
        return Promise.resolve('')
    }

    async tag (page) {
        return Promise.resolve([])
    }

    async tagline (page) {
        return Promise.resolve('')
    }

    async title (page) {
        return Promise.resolve('')
    }

    async year (page) {
        return Promise.resolve('')
    }
}

export default GIGA