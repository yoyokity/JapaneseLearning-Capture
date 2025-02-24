import { load as cheerioLoad } from 'cheerio'

import { Scraper } from '../scraper/Scraper.js'
import Session from '../scraper/tool/session.js'
import { formatTitle, maker_trans } from './getchu.js'
import Actor from '../scraper/Actor.js'
import translate from '../scraper/tool/translator.js'
import { Helper } from '../../yo-electron-lib/Helper/helper.js'

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Upgrade-Insecure-Requests': '1',
    'referer': 'https://www.dlsite.com'
}
const cookie = {
    'adultchecked': '1',
    'locale': 'zh-cn',
}

class DLsite extends Scraper {
    session = new Session('https:/www.dlsite.com/', headers, cookie)

    constructor (video) {
        super(video)
    }

    async checkConnect () {
        let re = await this.session.ping()
        if (!re) {
            return 'DLsite'
        }
        return true
    }

    async searchPage (video) {
        if (video.title.match(/^[A-Z\d]*?$/)) {

            const url = `https://www.dlsite.com/maniax/work/=/product_id/${video.title}.html`
            return await this.session.get(url) || null

        } else {

            const search_url = `maniax/fsr/=/keyword/${video.title.replaceAll(' ', '+')}/order/trend/work_type_category[0]/movie`
            const response = await this.session.get(search_url)

            if (!response) { return null }

            const $ = cheerioLoad(response)
            if ($('#search_result_img_box').length > 0) {
                const list = []
                $('#search_result_img_box li').each((index, liElement) => {
                    const aElement = $(liElement).find('dl.work_img_main dd.work_name div.multiline_truncate a')
                    const href = aElement.attr('href')
                    const title = aElement.attr('title')

                    if (href && title) {
                        list.push({ href, title })
                    }
                })

                //检测符合的结果
                for (const item of list) {
                    if (item.title.includes(video.title)) {
                        const match = item.href.match(/\/([A-Z\d]*?)\./)
                        this._num = match ? match[1] : null
                        return await this.session.get(item.href) || null
                    }
                }
            } else {
                return null
            }

        }
    }

    async title (page) {
        const $ = cheerioLoad(page)
        let title = $('#work_name').contents().text().trim() || null
        title = title.replace(/【.*?】/, '').replace('HD版', '').trim()
        this._originaltitle = title

        let a = formatTitle(title)
        title = a.title
        this._bigTitle = a.bigTitle
        this._title = title

        return title
    }

    async originaltitle (page) {
        return this._originaltitle
    }

    async sorttitle (page) {
        return this._title
    }

    async tagline (page) {
        return null
    }

    async num (page) {
        return this._num
    }

    async mpaa (page) {
        return 'JP-18+'
    }

    async rating (page) {
        const url = `https://www.dlsite.com/maniax/product/info/ajax?product_id=${this._num}&cdn_cache_min=1`
        const response = await this.session.get(url)

        if (!response) { return null }

        let a = JSON.parse(response)[this._num]
        if (!a) { return null }
        let rating = a['rate_average_2dp']
        if (rating) {
            return (parseFloat(rating) * 2).toString()
        }

        return rating
    }

    async director (page) {
        const $ = cheerioLoad(page)
        const text = $('#work_right_inner').text()

        const ROLE_PRIORITY = ['監督', '演出', '脚本']
        const ROLE_REGEX_TEMPLATE = /([^\s（]+?)\s*[（(]{{role}}/

        for (const role of ROLE_PRIORITY) {
            const dynamicRegex = new RegExp(
                ROLE_REGEX_TEMPLATE.source.replace('{{role}}', role)
            )
            const match = text.match(dynamicRegex)
            if (match) {
                this._director = match[1].trim()
                return this._director
            }
        }

        this._director = null
        return null
    }

    async actor (page) {
        const $ = cheerioLoad(page)
        const seiyuuList = $('th:contains("声优")')
            .next('td')
            .find('a')
            .map((i, el) => $(el).text().trim())
            .get()

        let actors = new Map()

        seiyuuList.forEach(name => {
            let actor = new Actor(name)
            actors.set(name, actor)
        })

        this._actors = actors
        return actors
    }

    async maker (page) {
        const $ = cheerioLoad(page)
        let maker = $('div#work_right_inner span.maker_name').find('a')
            .first().text().trim()

        if (maker in maker_trans) {
            maker = maker_trans[maker]
        }

        this._maker = maker
        return maker
    }

    async studio (page) {
        return this._maker
    }

    async set (page) {
        return null
    }

    async tag (page) {
        const $ = cheerioLoad(page)
        let tag = $('div.main_genre a')
            .map((i, el) => $(el).text().trim())
            .get()

        tag = tag.flatMap(item => item.split('/'))
        tag = ['成人动漫', this._maker, this._director, ...tag].filter(Boolean)

        this._tag = tag
        return tag
    }

    async genre (page) {
        return this._tag
    }

    async plot (page) {
        const $ = cheerioLoad(page)
        let plot = $('div.work_parts_area').text()

        if (plot) {
            return await translate.translate(plot) || plot
        }
    }

    async premiered (page) {
        return this._date
    }

    async releasedate (page) {
        return this._date
    }

    async year (page) {
        const $ = cheerioLoad(page)
        const time = $('th:contains("贩卖日")')
            .next('td')
            .find('a')
            .text()

        const year = time.match(/\d{4}/)[0]
        this._date = time.replace(/(\d{4})年(\d{1,2})月(\d{1,2})日/, '$1-$2-$3')

        return year
    }

    getDirectory (outputPath) {
        if (this._title === this._bigTitle) {
            return `${outputPath}\\${this._title}`
        }

        // 如果有集数，则多一层目录 （bigtitle不同于title时）
        return `${outputPath}\\${this._bigTitle}\\${this._title}`
    }

    async downloadImage (page, directory, extrafanartPath) {
        const $ = cheerioLoad(page)
        let imgList = $('div.product-slider-data div')
            .map((i, el) => 'https:' + $(el).attr('data-src'))
            .get()

        // 封面
        let url = imgList[0]
        let img = await this.session.getImage(url)

        if (img) {
            img.save(`${directory}\\poster.jpg`)
            img.save(`${directory}\\thumb.jpg`)
            await img.realesrgan()
            await img.save(`${directory}\\fanart.jpg`)
        } else return false

        //剧照
        for (let i = 1; i < imgList.length; i++) {
            let img = await this.session.getImage(imgList[i])
            if (img) {
                img.save(`${extrafanartPath}\\extrafanart-${i}.jpg`)
            }
        }

        return true
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

export default DLsite