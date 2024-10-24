import Session from './tool/session.js'
import { load as cheerioLoad } from 'cheerio'

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Upgrade-Insecure-Requests': '1',
    'Referer': 'https://javdb.com/',
}
const cookie = {
    'over18': '1', 'locale': 'zh'
}

export default class Actor {
    /**
     * 姓名
     * @type {string}
     */
    name
    /**
     * 照片链接
     * @type {string}
     */
    imgUrl
    /**
     * 性别
     * @type {string}
     */
    gender
    /**
     * 出生年月
     * @type {string}
     */
    birthdate
    /**
     * 三围
     * @type {string}
     */
    measurements
    /**
     * 罩杯
     * @type {string}
     */
    cup

    constructor (name) {
        this.name = name
    }

    /**
     * 返回信息文本
     * @return {string}
     */
    infoText () {
        let text = `${this.name}:\n`
        if (this.birthdate) text += this.birthdate + '\n'
        if (this.measurements) text += this.measurements
        if (this.cup) text += ' ' + this.cup
        return text
    }

    /**
     * 搜索演员信息，数据库中存在则直接拿取 (注意是异步函数)
     * @param {string|null} javDB_url 演员的javdb链接，忽略则根据名字搜索
     * @param {boolean} female 是否为女人
     * @returns {Promise<void>}
     */
    async search (javDB_url = null, female = true) {

        //检查数据库中是否已有演员信息
        if (this.get()) {
            return
        }

        //没有则搜索

        //从wiki获取基本信息
        if (female) {
            this.gender = 'female'
            let response = await new Session('https://ja.wikipedia.org/').get(`wiki/${encodeURIComponent(this.name)}`)
            if (response) {
                const $ = cheerioLoad(response)
                const infobox = $('.infobox')
                if (infobox) {
                    const text = infobox.text()

                    const birthdate = text.match(/\d{4}年\d+月\d+日/)?.[0]
                    if (birthdate) {
                        this.birthdate = birthdate.trim()
                    }

                    const measurements = text.match(/[\d ]+-[\d ]+-[\d ]+cm/)?.[0]
                    if (measurements) {
                        this.measurements = measurements.trim().replace(' ', '')
                    }
                    const cup = text.match(/[A-Z][0-9]*?\n/)?.[0]
                    if (cup) {
                        this.cup = cup.trim()
                    }
                }
            }
        } else {
            this.gender = 'male'
        }

        //在javdb中获取头像
        if (javDB_url) {
            this.imgUrl = await getImgFromJavDB(javDB_url)
        } else {
            //没有url搜索
            let session = new Session('https://javdb.com/', headers, cookie)
            let url = `search?f=actor&q=${encodeURIComponent(this.name)}`
            let response = await session.get(url)
            const $ = cheerioLoad(response)
            const elements = $('div#actors')
            if (elements.length > 0) {
                let a = elements.first().find('a')
                let title = a.attr('title')
                let url = a.attr('href')
                if (title.includes(this.name) && url) {
                    this.imgUrl = await getImgFromJavDB(url)
                }
            }
        }

        this.set()
    }

    /**
     * 从数据库中获取演员信息
     * @private
     */
    get () {
        if (typeof yoyoNode === 'undefined') return false
        let a = yoyoNode.store.get(this.name)
        if (a) {
            this.imgUrl = a?.imgUrl
            this.gender = a?.gender
            this.birthdate = a?.birthdate
            this.measurements = a?.measurements
            this.cup = a?.cup
            return true
        }
        return false
    }

    /**
     * 将演员信息存入数据库中
     * @private
     */
    set () {
        if (typeof yoyoNode === 'undefined') return
        yoyoNode.store.set(this.name, JSON.parse(JSON.stringify(this)))
    }

    /**
     * 检测网络连通性
     * @return {Promise<boolean|string>} 连通返回true，否则返回连接失败的站点
     */
    static async checkConnect () {
        let session = new Session('https://javdb.com/', headers, cookie)
        if (!await session.ping()) {
            return 'javdb'
        }
        session = new Session('https://ja.wikipedia.org/')
        if (!await session.ping()) {
            return 'wiki'
        }
        return true
    }
}

async function getImgFromJavDB (url) {
    let session = new Session('https://javdb.com/', headers, cookie)
    let response = await session.get(url)
    const $ = cheerioLoad(response)
    const elements = $('.column.actor-avatar')
    if (elements.length > 0) {
        let url = elements.html().match(/https:.+\.jpg/)?.[0]
        if (url) {
            return url
        }
    }
    return null
}