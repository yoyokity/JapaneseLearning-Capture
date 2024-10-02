import { load as cheerioLoad } from 'cheerio'

import { Scraper } from '../scraper/Scraper.js'
import Session from '../scraper/tool/session.js'
import translate from '../scraper/tool/translator.js'
import { Helper } from '../../yo-electron-lib/Helper/helper.js'

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Upgrade-Insecure-Requests': '1',
    'host': 'www.getchu.com',
    'referer': 'https://www.getchu.com'
}
const cookie = {
    'getchu_adalt_flag': 'getchu.com'
}

class getchu extends Scraper {
    session = new Session('https://www.getchu.com/', headers, cookie)

    constructor (video) {
        super(video)
    }

    async actor (page) {
        return null
    }

    async checkConnect () {
        let response = await this.session.get('')
        if (response) {
            return true
        }
        return null
    }

    async searchPage (video) {
        this._num = video.title
        const search_url = `soft.phtml?id=${video.title}`
        const response = await this.session.getArrayBuffer(search_url)

        if (!response.status) { return null }

        let decoder = new TextDecoder('EUC-JP')
        let u8arr = new Uint8Array(response.data)

        return decoder.decode(u8arr)
    }

    async director (page) {
        const $ = cheerioLoad(page)
        const text = $('div#wrapper').text()
        let regex = /監督(.*?)：(?<name>.*)[\n ]/
        let match = text.match(regex)
        if (match && match.groups) {
            this._director = match.groups.name
            return match.groups.name
        }

        //没有監督用制片人
        regex = /プロデューサー(.*?)：(?<name>.*)[\n ]/
        match = text.match(regex)
        if (match && match.groups) {
            this._director = match.groups.name
            return match.groups.name
        }

        this._director = null
        return null
    }

    async downloadImage (page, directory, extrafanartPath) {
        const $ = cheerioLoad(page)

        // 封面
        let url = $('table#soft_table').find('img').first().attr('src').replace(/^\.\/ */, '')
        let img = await this.session.getImage(url)

        if (img) {
            img.save(`${directory}\\poster.jpg`)
            img.save(`${directory}\\thumb.jpg`)
            await img.realesrgan()
            await img.save(`${directory}\\fanart.jpg`)
        } else return false

        //剧照
        let targetElement = $('div.tabletitle').filter(function () {
            return $(this).text().includes('サンプル画像')
        })
        let hrefs = targetElement.next().find('img').map(function () {
            return $(this).attr('src').replace(/^\.\/ */, '')
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
        return ['成人动漫', this._maker, this._director]
    }

    getDirectory (outputPath) {
        return `${outputPath}\\${this._bigTitle}`
    }

    async maker (page) {
        const $ = cheerioLoad(page)
        let maker = $('a#brandsite').text().trim() || null

        if (maker in maker_trans) {
            maker = maker_trans[maker]
        }

        this._maker = maker
        return maker
    }

    async mpaa (page) {
        return 'JP-18+'
    }

    async num (page) {
        return this._num
    }

    async originaltitle (page) {
        return this._originaltitle
    }

    async plot (page) {
        const $ = cheerioLoad(page)
        const j = $('div.tabletitle')
        let targetElement = j.filter(function () {
            return $(this).text().trim() === 'ストーリー'
        })
        let plot = targetElement.next().text().trim() || null
        if (plot) {
            return await translate.translate(plot)
        }

        //简介没有ストーリー就用商品紹介
        targetElement = j.filter(function () {
            return $(this).text().trim() === '商品紹介'
        })
        plot = targetElement.next().text().trim() || null
        if (plot) {
            return await translate.translate(plot)
        }

        return null
    }

    async year (page) {
        const $ = cheerioLoad(page)
        const targetElement = $('td').filter(function () {
            return $(this).text().trim() === '発売日：'
        })

        let time = targetElement.next().text().trim() || null
        if (time) {
            this._date = time.replace('/', '-')
            return time.slice(0, 4)
        }

        this._date = null
        return null
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
        return this._maker
    }

    async tag (page) {
        return ['成人动漫', this._maker, this._director]
    }

    async tagline (page) {
        return null
    }

    async title (page) {
        const $ = cheerioLoad(page)
        let title = $('h1#soft-title').contents()
            .filter(function () {
                return this.type === 'text'
            })
            .text().trim() || null
        this._originaltitle = title

        let a = formatTitle(title)
        title = a.title
        this._bigTitle = a.bigTitle
        this._title = title

        return title
    }

    /**
     * 创建目录，创建nfo文件，移动视频
     * @param {string} page 网页文本
     * @param {string} directory 影片的目录
     * @param {string} saveFileName 保存文件名，不带路径和后缀
     * @param {string} filePath 源文件路径
     * @returns {Promise<void>}
     */
    async createDirectory (page, directory, saveFileName, filePath) {
        saveFileName = this._title
        Helper.path.createPath(directory)
        Helper.path.createPath(`${directory}\\extrafanart`)

        this.video.createNfo().save(`${directory}\\${saveFileName}.nfo`)

        await Helper.path.moveFile(filePath, directory, saveFileName)
    }
}

export default getchu

/**
 * 格式化标题
 * @param {string} title
 * @return {{title: string, bigTitle:string}} title为去掉OVA和THE ANIMATION后的标题，bigTitle为同时不含集数的系列标题
 */
export function formatTitle (title) {
    if (title.includes('OVA')) {
        title = title.replace('OVA', '').trim()
    }

    if (title.includes('THE ANIMATION')) {
        title = title.replace(' THE ANIMATION', '').trim()
    }

    let title2 = title

    if (title.includes(' 第')) {
        title2 = title2.split(' 第')[0].trim()
    }
    if (title.includes('＃')) {
        title2 = title2.split('＃')[0].trim()
    }

    let bigTitle = title2
    return { title, bigTitle }
}

/**
 * 用于对厂商进行翻译
 */
export const maker_trans = {
    'ピンクパイナップル': 'pinkpineapple',
    'ばにぃうぉ〜か〜': 'lune-soft',
    'あんてきぬすっ': 'lune-soft',
    'じゅうしぃまんご〜': 'lune-soft',
    'ショーテン': 'showten',
    'メリー・ジェーン': 'mary-jane',
}