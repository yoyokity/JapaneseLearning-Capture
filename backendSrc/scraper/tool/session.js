import got from 'got'
import { HttpsProxyAgent } from 'hpagent'

import Image from './image.js'

class Session {
    static timeout = 10000
    static retry = 3
    static delay = 3000
    static proxy = null
    static get_proxy_text = () => `http://${Session.proxy.host}:${Session.proxy.port}`

    /**
     * got实例
     * @type {got.GotInstance}
     */
    instance

    /** @type {string|null} */
    #baseUrl

    /**
     * 用于储存每个站点的下一次可访问时间，避免频繁访问
     * @type {Map<string, number>}
     */
    static delayDict = new Map()

    constructor (baseURL = null, headers = null, cookie = null) {
        this.#baseUrl = baseURL

        let config = {
            headers: createHeaders(headers, cookie),
            timeout: {
                request: Session.timeout
            },
            retry: {
                limit: Session.retry,
                methods: [
                    'GET',
                    'PUT',
                    'HEAD',
                    'DELETE',
                    'OPTIONS',
                    'TRACE'
                ],
                statusCodes: [400, 401, 403, 404, 500, 502, 503, 504],
                errorCodes: ['ETIMEDOUT', 'ECONNRESET', 'EADDRINUSE', 'ECONNREFUSED', 'EPIPE', 'ENETUNREACH', 'EAI_AGAIN'],
                calculateDelay: ({ attemptCount, retryOptions, error, computedValue }) => {
                    if (attemptCount === 1) {
                        return computedValue
                    }
                    console.warn(`Attempt ${attemptCount - 1}: ${error.message}  url: ${error.options.url.href}`)
                    return computedValue
                },
                backoffLimit: 1000
            },
            hooks: {
                //重试
                beforeError: [
                    (error) => {
                        console.error(`connection error: ${error.options.url.href}`)
                        console.error(`${error.name}: ${error.message}`)
                        if (error.response) {
                            console.error(`status: ${error.response.statusCode}`)
                        }
                        return error
                    }
                ],
                //设置同一个host的访问间隔时间（忽略图片资源）
                beforeRequest: [
                    async options => {
                        let href = options.url.href
                        let hostName = options.url.hostname
                        let isImg = href.match(/\.(jpeg|jpg|gif|png|webp)$/i)
                        if (!isImg) {
                            const currentTime = Date.now();
                            const nextAvailableTime = Session.delayDict.get(hostName) || 0;

                            if (currentTime < nextAvailableTime) {
                                const delay = nextAvailableTime - currentTime;
                                await sleep(delay);
                            }

                            Session.delayDict.set(hostName, Date.now() + Session.delay);
                        }
                    }
                ]
            }
        }
        if (Session.proxy) {
            config.agent = {
                https: new HttpsProxyAgent({
                    keepAlive: true,
                    keepAliveMsecs: 1000,
                    maxSockets: 256,
                    maxFreeSockets: 256,
                    scheduling: 'lifo',
                    proxy: Session.get_proxy_text()
                }),
                http: new HttpsProxyAgent({
                    keepAlive: true,
                    keepAliveMsecs: 1000,
                    maxSockets: 256,
                    maxFreeSockets: 256,
                    scheduling: 'lifo',
                    proxy: Session.get_proxy_text()
                })
            }
        }

        this.instance = got.extend(config)
    }

    /**
     * 获取网页内容
     * @param {string|null} url path或完整url
     * @param {object|null} headers 会覆盖
     * @param {object|null} cookie 会覆盖
     * @return {Promise<string|null>}
     */
    async get (url = null, headers = null, cookie = null) {
        url = combineUrl(this.#baseUrl, url)
        if (!url) return null

        let config = {
            headers: createHeaders(headers, cookie)
        }

        try {
            let re = await this.instance.get(url, config)
            if (re) {
                return re.body
            }

            return null
        } catch (e) {
            return null
        }
    }

    /**
     * 发送post请求
     * @param {string|null} url path或完整url
     * @param {object|null} headers 会覆盖
     * @param {object|null} cookie 会覆盖
     * @return {Promise<boolean>} 成功为true，否贼为false
     */
    async post (url = null, headers = null, cookie = null) {
        url = combineUrl(this.#baseUrl, url)
        if (!url) return false

        let config = {
            headers: createHeaders(headers, cookie)
        }

        try {
            let re = await this.instance.post(url, config)
            return re.statusCode < 400;
        } catch (e) {
            return false
        }
    }

    /**
     * 获取cookie信息，失败返回null，不会重定向访问
     * @param {string|null} url path或完整url
     * @param {object|null} headers 会覆盖
     * @param {object|null} cookie 会覆盖
     * @return {Promise<object|null>}
     */
    async getCookie (url = null, headers = null, cookie = null) {
        url = combineUrl(this.#baseUrl, url)
        if (!url) return null

        let config = {
            followRedirect: false, //禁止重定向
            headers: createHeaders(headers, cookie)
        }

        try {
            let re = await this.instance.get(url, config)
            if (re) {
                let cookie = re.headers['set-cookie']
                return parseCookies(cookie)
            }

            return null
        } catch (e) {
            return null
        }
    }

    /**
     * 获取图片，失败返回null，不会重定向访问
     * @param {string|null} url path或完整url
     * @param {object|null} headers 会覆盖
     * @param {object|null} cookie 会覆盖
     * @return {Promise<Image|null>}
     */
    async getImage (url = null, headers = null, cookie = null) {
        url = combineUrl(this.#baseUrl, url)
        if (!url) return null

        let config = {
            followRedirect: false, //禁止重定向
            responseType: 'buffer',
            headers: createHeaders(headers, cookie)
        }

        try {
            let re = await this.instance.get(url, config)
            if (re) {
                let data = re.body
                if (data instanceof Buffer) {
                    return new Image(data)
                }
            }

            return null
        } catch (e) {
            return null
        }
    }
}

function sleep (time) {
    return new Promise((resolve) => {
        setTimeout(resolve, time)
    })
}

function serializeObjectToCookieText (obj, days = 7) {
    const cookies = []
    const date = new Date()
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000))
    const expires = `; expires=${date.toUTCString()}; path=/`

    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            const value = encodeURIComponent(obj[key])
            const cookie = `${key}=${value}${expires}`
            cookies.push(cookie)
        }
    }

    return cookies.join('; ')
}

/**
 * @param {string[]} cookies
 * @returns {{}}
 */
function parseCookies (cookies) {
    const cookieObject = {}

    cookies.forEach(cookie => {
        cookie.split(';').forEach(part => {
            const [key, value] = part.split('=')
            if (key && value) {
                cookieObject[key.trim()] = value.trim()
            }
        })
    })

    return cookieObject
}

function createHeaders (headers, cookie) {
    let _headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    }

    if (headers) {
        _headers = {
            ..._headers,
            ...headers
        }
    }

    if (cookie) {
        _headers.Cookie = serializeObjectToCookieText(cookie)
    }

    return _headers
}

function combineUrl (baseURL, path) {
    function parse (baseURL, path) {
        if (!baseURL && !path) {
            return undefined
        }

        if (!baseURL) {
            try {
                const url = new URL(path)
                return url.href
            } catch (error) {
                return undefined
            }
        }

        if (!path) {
            try {
                const url = new URL(baseURL)
                return url.href
            } catch (error) {
                return undefined
            }
        }

        try {
            const url = new URL(path)
            return url.href
        } catch (error) {
            const fullUrl = new URL(path, baseURL)
            return fullUrl.href
        }
    }

    let url = parse(baseURL, path)
    if (!url) {
        console.error(`Invalid URL! \nbaseURL:${baseURL}\n path:${path}`)
        return null
    }
    return url
}

export default Session
