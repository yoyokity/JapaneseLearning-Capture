import Video from './Video.js'
import { Helper } from '../../yo-electron-lib/Helper/helper.js'
import { pathToFileURL } from 'url'
import Nfo from './Nfo.js'

class Scraper {
    /** 刮削器子类 */
    static subclasses = {}

    static load () {
        const modulesDir = Helper.path.dataDir.join('backendSrc/plugins')
        const files = Helper.path.searchFiles(modulesDir.str, ['.js'])
        files.forEach(async (file) => {
            const fileUrl = pathToFileURL(file).href
            const module = await import(fileUrl)
            Scraper.subclasses[module.default.name] = module.default
        })
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
     * 返回保存影片的文件夹地址，该目录应包含媒体文件，nfo文件，图片文件等
     * @abstract
     * @param outputPath 输出目录
     * @returns {string}
     */
    getDirectory (outputPath) {}

    //刮削

    /**
     * 搜索影片首页，返回网页文本，失败返回null
     * @abstract
     * @returns {Promise<string>}
     */
    async searchPage (video) {}

    /**
     * 解析-大标题 并返回，失败返回null
     * @abstract
     * @param {string} page 网页文本
     * @returns {Promise<string>}
     */
    async title (page) {}

    /**
     * 解析-原始标题（jellyfin中会显示在大标题下方作为小标题）并返回，失败返回null
     * @abstract
     * @param {string} page 网页文本
     * @returns {Promise<string>}
     */
    async originaltitle (page) {}

    /**
     * 解析-排序标题（名称排序时会以此为标准）并返回，失败返回null
     * @abstract
     * @param {string} page 网页文本
     * @returns {Promise<string>}
     */
    async sorttitle (page) {}

    /**
     * 解析-宣传词 并返回，失败返回null
     * @abstract
     * @param {string} page 网页文本
     * @returns {Promise<string>}
     */
    async tagline (page) {}

    /**
     * 解析-编号（如番号、网站-编号）并返回，失败返回null
     * @abstract
     * @param {string} page 网页文本
     * @returns {Promise<string>}
     */
    async num (page) {}

    /**
     * 解析-分级（如JP-18+)并返回，失败返回null
     * @abstract
     * @param {string} page 网页文本
     * @returns {Promise<string>}
     */
    async mpaa (page) {}

    /**
     * 解析-评分（尽量以10分为满分）并返回，失败返回null
     * @abstract
     * @param {string} page 网页文本
     * @returns {Promise<string>}
     */
    async rating (page) {}

    /**
     * 解析-导演 并返回，失败返回null
     * @abstract
     * @param {string} page 网页文本
     * @returns {Promise<string>}
     */
    async director (page) {}

    /**
     * 解析-演员 并返回Map，失败返回null
     *
     * 需要包含姓名、照片链接（可包含性别、出生年月、三围等info，可以放在视频简介里，因为nfo读取不到这些信息）
     * @abstract
     * @param {string} page 网页文本
     * @returns {Promise<Map<string, {name:string, imgUrl:string, gender:string, info:string}>>}
     */
    async actor (page) {}

    /**
     * 解析-制片商 并返回，失败返回null
     * @abstract
     * @param {string} page 网页文本
     * @returns {Promise<string>}
     */
    async maker (page) {}

    /**
     * 解析-发行商 并返回，失败返回null
     * @abstract
     * @param {string} page 网页文本
     * @returns {Promise<string>}
     */
    async studio (page) {}

    /**
     * 解析-影片系列 并返回，失败返回null
     * @abstract
     * @param {string} page 网页文本
     * @returns {Promise<string>}
     */
    async set (page) {}

    /**
     * 解析-影片标签 并返回，失败返回null
     * @abstract
     * @param {string} page 网页文本
     * @returns {Promise<[string]>}
     */
    async tag (page) {}

    /**
     * 解析-影片类型 并返回，失败返回null
     * @abstract
     * @param {string} page 网页文本
     * @returns {Promise<[string]>}
     */
    async genre (page) {}

    /**
     * 解析-简介 并返回，失败返回null
     * @abstract
     * @param {string} page 网页文本
     * @returns {Promise<string>}
     */
    async plot (page) {}

    /**
     * 解析-发行年份 并返回，失败返回null
     * @abstract
     * @param {string} page 网页文本
     * @returns {Promise<string>}
     */
    async year (page) {}

    /**
     * 解析-首映日期 并返回，失败返回null
     * @abstract
     * @param {string} page 网页文本
     * @returns {Promise<string>}
     */
    async premiered (page) {}

    /**
     * 解析-上映日期 并返回，失败返回null
     * @abstract
     * @param {string} page 网页文本
     * @returns {Promise<string>}
     */
    async releasedate (page) {}

    /**
     * 创建目录，创建nfo文件，移动视频
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
     * 下载图片，成功返回true，失败返回null
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
     * @returns {Promise<boolean|null>}
     */
    async run (outputPath, saveFileName, filePath) {
        this.saveFileName = saveFileName
        this.directory = this.getDirectory(outputPath)

        let page = await this.searchPage(this.video)
        if (!page) {
            console.warn(`找不到影片：${this.video.title}`)
            return null
        }

        let title = await this.title(page)
        if (title) {
            this.video.title = title
        } else {
            console.warn(`title未解析`)
        }

        let originaltitle = await this.originaltitle(page)
        if (originaltitle) {
            this.video.originaltitle = originaltitle
        } else {
            console.warn(`originaltitle未解析`)
        }

        let sorttitle = await this.sorttitle(page)
        if (sorttitle) {
            this.video.sorttitle = sorttitle
        } else {
            console.warn(`sorttitle未解析`)
        }

        let tagline = await this.tagline(page)
        if (tagline) {
            this.video.tagline = tagline
        } else {
            console.warn(`tagline未解析`)
        }

        let num = await this.num(page)
        if (num) {
            this.video.num = num
        } else {
            console.warn(`num未解析`)
        }

        let mpaa = await this.mpaa(page)
        if (mpaa) {
            this.video.mpaa = mpaa
        } else {
            console.warn(`mpaa未解析`)
        }

        let rating = await this.rating(page)
        if (rating) {
            this.video.rating = rating
        } else {
            console.warn(`rating未解析`)
        }

        let director = await this.director(page)
        if (director) {
            this.video.director = director
        } else {
            console.warn(`director未解析`)
        }

        let actor = await this.actor(page)
        if (actor) {
            this.video.actor = actor
        } else {
            console.warn(`actor未解析`)
        }

        let maker = await this.maker(page)
        if (maker) {
            this.video.maker = maker
        } else {
            console.warn(`maker未解析`)
        }

        let studio = await this.studio(page)
        if (studio) {
            this.video.studio = studio
        } else {
            console.warn(`studio未解析`)
        }

        let set = await this.set(page)
        if (set) {
            this.video.set = set
        } else {
            console.warn(`set未解析`)
        }

        let tag = await this.tag(page)
        if (tag) {
            this.video.tag = tag
        } else {
            console.warn(`tag未解析`)
        }

        let genre = await this.genre(page)
        if (genre) {
            this.video.genre = genre
        } else {
            console.warn(`genre未解析`)
        }

        let plot = await this.plot(page)
        if (plot) {
            this.video.plot = plot
        } else {
            console.warn(`plot未解析`)
        }

        let year = await this.year(page)
        if (year) {
            this.video.year = year
        } else {
            console.warn(`year未解析`)
        }

        let premiered = await this.premiered(page)
        if (premiered) {
            this.video.premiered = premiered
        } else {
            console.warn(`premiered未解析`)
        }

        let releasedate = await this.releasedate(page)
        if (releasedate) {
            this.video.releasedate = releasedate
        } else {
            console.warn(`releasedate未解析`)
        }

        await this.createDirectory(page, this.directory, this.saveFileName, filePath)

        if (!await this.downloadImage(page, this.directory, `${this.directory}\\extrafanart`)) {
            console.warn(`image下载失败`)
            return null
        }

        return true
    }
}

export default Scraper
