import Nfo from './Nfo.js'
import Actor from './Actor.js'

class Video {

    constructor (title) {
        this.title = title
    }

    /**
     * 使用的刮削器名称
     * @type {string}
     */
    scraperName = ''
    /**
     * 大标题
     * @type {string}
     */
    title = ''
    /**
     * 原始标题，jellyfin中会显示在大标题下方作为小标题
     * @type {string}
     */
    originaltitle = ''
    /**
     * 排序标题，名称排序时会以此为标准
     * @type {string}
     */
    sorttitle = ''
    /**
     * 宣传词
     * @type {string}
     */
    tagline = ''
    /**
     * 编号，如番号、网站-编号
     * @type {string}
     */
    num = ''
    /**
     * 分级，如JP-18+
     * @type {string}
     */
    mpaa = ''
    /**
     * 评分，尽量以10分为满分
     * @type {string}
     */
    rating = ''
    /**
     * 导演
     * @type {string}
     */
    director = ''
    /**
     * 演员，需要包含姓名、照片链接（可包含性别、出生年月、三围，可以放在视频简介里，因为nfo读取不到这些信息）
     * @type {Map<string, Actor>}
     */
    actor = new Map()
    /**
     * 发行商
     * @type {string}
     */
    studio = ''
    /**
     * 制片商
     * @type {string}
     */
    maker = ''
    /**
     * 影片系列
     * @type {string}
     */
    set = ''
    /**
     * 影片标签
     * @type {[string]}
     */
    tag = []
    /**
     * 影片类型
     * @type {[string]}
     */
    genre = []
    /**
     * 简介
     * @type {string}
     */
    plot = ''
    /**
     * 发行年份
     * @type {string}
     */
    year = ''
    /**
     * 首映日期，一般与releasedate相同
     * @type {string}
     */
    premiered = ''
    /**
     * 上映日期
     * @type {string}
     */
    releasedate = ''

    /**
     * 返回nfo对象
     * @returns {Nfo}
     */
    createNfo () {
        let nfo = new Nfo()
        let root = nfo.instance.ele('movie')

        this.addElement(root, 'scraperName')
        this.addElement(root, 'title')
        this.addElement(root, 'originaltitle')
        this.addElement(root, 'sorttitle')
        this.addElement(root, 'tagline')
        this.addElement(root, 'plot')
        this.addElement(root, 'num')
        this.addElement(root, 'mpaa')
        this.addElement(root, 'rating')
        this.addElement(root, 'director')

        this.actor.forEach((value, key, map) => {
            let actor = root.ele('actor')
            actor.ele('name').txt(key)
            if (value.imgUrl) {
                actor.ele('thumb').txt(value.imgUrl)
            }
        })

        this.addElement(root, 'studio')
        this.addElement(root, 'maker')
        this.addElement(root, 'set')

        for (let tag of this.tag) {
            root.ele('tag').txt(tag)
        }
        for (let genre of this.genre) {
            root.ele('genre').txt(genre)
        }

        this.addElement(root, 'year')
        this.addElement(root, 'premiered')
        this.addElement(root, 'releasedate')
        root.ele('poster').txt('poster.jpg')
        root.ele('thumb').txt('thumb.jpg')
        root.ele('fanart').txt('fanart.jpg')

        return nfo
    }

    /**
     * @private
     * @param {string} node
     * @param root
     */
    addElement (root, node) {
        if (this[node] !== '') {
            root.ele(node).txt(this[node])
        }
    }
}

export default Video