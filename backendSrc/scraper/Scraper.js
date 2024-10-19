import Video from './Video.js'
import { Helper } from '../../yo-electron-lib/Helper/helper.js'
import { pathToFileURL } from 'url'
import Nfo from './Nfo.js'
import Actor from './Actor.js'

export class Scraper {
    /** 刮削器子类 */
    static subclasses = {}

    static async load () {
        const modulesDir = Helper.path.dataDir.join('backendSrc/plugins')
        const files = Helper.path.searchFiles(modulesDir.str, ['.js'])
        for (const file of files) {
            const fileUrl = pathToFileURL(file).href
            const module = await import(fileUrl)
            if (module.default) {
                Scraper.subclasses[module.default.name] = module.default
            }
        }
    }

    /** @type {Video} */
    video
    /**
     * 保存的文件名，不包括后缀名
     * @type {string}
     */
    saveFileName
    /**
     * 保存影片的文件夹地址，该目录应包含媒体文件，nfo文件，图片文件等
     * @type {string}
     */
    directory

    /**
     * 注册一个刮削器，一个刮削器对应一个影片
     * @abstract
     * @param {Video} video
     */
    constructor (video) {
        if (this.constructor === Scraper) {
            throw new Error('无法实例化抽象类 BaseScraper，请继承该类后实例化子类')
        }

        this.video = video
    }

    /**
     * 检查连接，成功返回true，失败返回null
     * @abstract
     * @returns {Promise<boolean>}
     */
    async checkConnect () {}

    /**
     * 20、返回保存影片的文件夹地址，该目录应包含媒体文件，nfo文件，图片文件等
     * @abstract
     * @param outputPath 输出目录
     * @returns {string}
     */
    getDirectory (outputPath) {}

    //刮削

    /**
     * 1、搜索影片首页，返回网页文本，失败返回null
     * @abstract
     * @param {Video} video
     * @returns {Promise<string>}
     */
    async searchPage (video) {}

    /**
     * 2、解析-大标题 并返回，失败返回null
     * @abstract
     * @param {string} page 网页文本
     * @returns {Promise<string>}
     */
    async title (page) {}

    /**
     * 3、解析-原始标题（jellyfin中会显示在大标题下方作为小标题）并返回，失败返回null
     * @abstract
     * @param {string} page 网页文本
     * @returns {Promise<string>}
     */
    async originaltitle (page) {}

    /**
     * 4、解析-排序标题（名称排序时会以此为标准）并返回，失败返回null
     * @abstract
     * @param {string} page 网页文本
     * @returns {Promise<string>}
     */
    async sorttitle (page) {}

    /**
     * 5、解析-宣传词 并返回，失败返回null
     * @abstract
     * @param {string} page 网页文本
     * @returns {Promise<string>}
     */
    async tagline (page) {}

    /**
     * 6、解析-编号（如番号、网站-编号）并返回，失败返回null
     * @abstract
     * @param {string} page 网页文本
     * @returns {Promise<string>}
     */
    async num (page) {}

    /**
     * 7、解析-分级（如JP-18+)并返回，失败返回null
     * @abstract
     * @param {string} page 网页文本
     * @returns {Promise<string>}
     */
    async mpaa (page) {}

    /**
     * 8、解析-评分（尽量以10分为满分）并返回，失败返回null
     * @abstract
     * @param {string} page 网页文本
     * @returns {Promise<string>}
     */
    async rating (page) {}

    /**
     * 9、解析-导演 并返回，失败返回null
     * @abstract
     * @param {string} page 网页文本
     * @returns {Promise<string>}
     */
    async director (page) {}

    /**
     * 10、解析-演员 并返回Map，失败返回null
     *
     * 需要包含姓名、照片链接（可包含性别、出生年月、三围等info，可以放在视频简介里，因为nfo读取不到这些信息）
     * @abstract
     * @param {string} page 网页文本
     * @returns {Promise<Map<string, Actor>>}
     */
    async actor (page) {}

    /**
     * 11、解析-制片商 并返回，失败返回null
     * @abstract
     * @param {string} page 网页文本
     * @returns {Promise<string>}
     */
    async maker (page) {}

    /**
     * 12、解析-发行商 并返回，失败返回null
     * @abstract
     * @param {string} page 网页文本
     * @returns {Promise<string>}
     */
    async studio (page) {}

    /**
     * 13、解析-影片系列 并返回，失败返回null
     * @abstract
     * @param {string} page 网页文本
     * @returns {Promise<string>}
     */
    async set (page) {}

    /**
     * 14、解析-影片标签 并返回，失败返回null
     * @abstract
     * @param {string} page 网页文本
     * @returns {Promise<[string]>}
     */
    async tag (page) {}

    /**
     * 15、解析-影片类型 并返回，失败返回null
     * @abstract
     * @param {string} page 网页文本
     * @returns {Promise<[string]>}
     */
    async genre (page) {}

    /**
     * 16、解析-简介 并返回，失败返回null
     * @abstract
     * @param {string} page 网页文本
     * @returns {Promise<string>}
     */
    async plot (page) {}

    /**
     * 17、解析-发行年份 并返回，失败返回null
     * @abstract
     * @param {string} page 网页文本
     * @returns {Promise<string>}
     */
    async year (page) {}

    /**
     * 18、解析-首映日期 并返回 (年-月-日)，失败返回null
     * @abstract
     * @param {string} page 网页文本
     * @returns {Promise<string>}
     */
    async premiered (page) {}

    /**
     * 19、解析-上映日期 并返回 (年-月-日)，失败返回null
     * @abstract
     * @param {string} page 网页文本
     * @returns {Promise<string>}
     */
    async releasedate (page) {}

    /**
     * 21、创建目录，创建nfo文件，移动视频
     * @param {string} page 网页文本
     * @param {string} directory 影片的目录
     * @param {string} saveFileName 保存文件名，不带路径和后缀
     * @param {string} filePath 源文件路径
     * @returns {Promise<void>}
     */
    async createDirectory (page, directory, saveFileName, filePath) {
        Helper.path.createPath(directory)
        Helper.path.createPath(`${directory}\\extrafanart`)

        this.video.createNfo().save(`${directory}\\${saveFileName}.nfo`)

        await Helper.path.moveFile(filePath, directory, saveFileName)
    }

    /**
     * 22、下载图片，成功返回true，失败返回null
     * @abstract
     * @param {string} page 网页文本
     * @param {string} directory 影片的目录
     * @param {string} extrafanartPath 剧照目录
     * @return {Promise<boolean>}
     */
    async downloadImage (page, directory, extrafanartPath) {}

    /**
     *
     * @param {string} outputPath 媒体库路径
     * @param {string} saveFileName 保存文件名，不带路径和后缀
     * @param {string} filePath 源文件路径
     * @param {InvokeClient} client
     * @returns {Promise<boolean|null>}
     */
    async run (outputPath, saveFileName, filePath, client) {
        Helper.logging.log(`开始刮削：${saveFileName}`)
        if (!scraping.value) return null

        this.saveFileName = saveFileName

        if (!scraping.value) return null
        let page = await this.searchPage(this.video)
        if (!page) {
            Helper.logging.warn(`找不到影片：${this.video.title}`)
            Helper.logging.log(`刮削结束：${saveFileName}`)
            return null
        }
        client.respond({
            type: 'sub',
            text: '刮削title'
        })

        if (!scraping.value) return null
        let title = await this.title(page)
        if (title) {
            this.video.title = title
        } else {
            Helper.logging.warn(`title未解析`)
        }
        client.respond({
            type: 'sub',
            text: '刮削originaltitle'
        })

        if (!scraping.value) return null
        let originaltitle = await this.originaltitle(page)
        if (originaltitle) {
            this.video.originaltitle = originaltitle
        } else {
            Helper.logging.warn(`originaltitle未解析`)
        }
        client.respond({
            type: 'sub',
            text: '刮削sorttitle'
        })

        if (!scraping.value) return null
        let sorttitle = await this.sorttitle(page)
        if (sorttitle) {
            this.video.sorttitle = sorttitle
        } else {
            Helper.logging.warn(`sorttitle未解析`)
        }
        client.respond({
            type: 'sub',
            text: '刮削tagline'
        })

        if (!scraping.value) return null
        let tagline = await this.tagline(page)
        if (tagline) {
            this.video.tagline = tagline
        } else {
            Helper.logging.warn(`tagline未解析`)
        }
        client.respond({
            type: 'sub',
            text: '刮削num'
        })

        if (!scraping.value) return null
        let num = await this.num(page)
        if (num) {
            this.video.num = num
        } else {
            Helper.logging.warn(`num未解析`)
        }
        client.respond({
            type: 'sub',
            text: '刮削mpaa'
        })

        if (!scraping.value) return null
        let mpaa = await this.mpaa(page)
        if (mpaa) {
            this.video.mpaa = mpaa
        } else {
            Helper.logging.warn(`mpaa未解析`)
        }
        client.respond({
            type: 'sub',
            text: '刮削rating'
        })

        if (!scraping.value) return null
        let rating = await this.rating(page)
        if (rating) {
            this.video.rating = rating
        } else {
            Helper.logging.warn(`rating未解析`)
        }
        client.respond({
            type: 'sub',
            text: '刮削director'
        })

        if (!scraping.value) return null
        let director = await this.director(page)
        if (director) {
            this.video.director = director
        } else {
            Helper.logging.warn(`director未解析`)
        }
        client.respond({
            type: 'sub',
            text: '刮削actor'
        })

        if (!scraping.value) return null
        let actor = await this.actor(page)
        if (actor) {
            this.video.actor = actor
        } else {
            Helper.logging.warn(`actor未解析`)
        }
        client.respond({
            type: 'sub',
            text: '刮削maker'
        })

        if (!scraping.value) return null
        let maker = await this.maker(page)
        if (maker) {
            this.video.maker = maker
        } else {
            Helper.logging.warn(`maker未解析`)
        }
        client.respond({
            type: 'sub',
            text: '刮削studio'
        })

        if (!scraping.value) return null
        let studio = await this.studio(page)
        if (studio) {
            this.video.studio = studio
        } else {
            Helper.logging.warn(`studio未解析`)
        }
        client.respond({
            type: 'sub',
            text: '刮削set'
        })

        if (!scraping.value) return null
        let set = await this.set(page)
        if (set) {
            this.video.set = set
        } else {
            Helper.logging.warn(`set未解析`)
        }
        client.respond({
            type: 'sub',
            text: '刮削tag'
        })

        if (!scraping.value) return null
        let tag = await this.tag(page)
        if (tag) {
            this.video.tag = tag
        } else {
            Helper.logging.warn(`tag未解析`)
        }
        client.respond({
            type: 'sub',
            text: '刮削genre'
        })

        if (!scraping.value) return null
        let genre = await this.genre(page)
        if (genre) {
            this.video.genre = genre
        } else {
            Helper.logging.warn(`genre未解析`)
        }
        client.respond({
            type: 'sub',
            text: '刮削plot'
        })

        if (!scraping.value) return null
        let plot = await this.plot(page)
        if (plot) {
            this.video.plot = plot
        } else {
            Helper.logging.warn(`plot未解析`)
        }
        client.respond({
            type: 'sub',
            text: '刮削year'
        })

        if (!scraping.value) return null
        let year = await this.year(page)
        if (year) {
            this.video.year = year
        } else {
            Helper.logging.warn(`year未解析`)
        }
        client.respond({
            type: 'sub',
            text: '刮削premiered'
        })

        if (!scraping.value) return null
        let premiered = await this.premiered(page)
        if (premiered) {
            this.video.premiered = premiered
        } else {
            Helper.logging.warn(`premiered未解析`)
        }
        client.respond({
            type: 'sub',
            text: '刮削releasedate'
        })

        if (!scraping.value) return null
        let releasedate = await this.releasedate(page)
        if (releasedate) {
            this.video.releasedate = releasedate
        } else {
            Helper.logging.warn(`releasedate未解析`)
        }
        client.respond({
            type: 'sub',
            text: '移动文件'
        })

        this.directory = this.getDirectory(outputPath)

        if (!scraping.value) return null
        await this.createDirectory(page, this.directory, this.saveFileName, filePath)
        client.respond({
            type: 'sub',
            text: '下载图片'
        })

        if (!scraping.value) return null
        if (!await this.downloadImage(page, this.directory, `${this.directory}\\extrafanart`)) {
            Helper.logging.warn(`image下载失败`)
            Helper.logging.log(`刮削结束：${saveFileName}`)
            return null
        }
        client.respond({
            type: 'sub',
            text: '结束刮削'
        })

        Helper.logging.log(`刮削结束：${saveFileName}`)
        return true
    }
}

export let scraping = {
    value: true
}
