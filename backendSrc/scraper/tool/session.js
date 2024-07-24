import Axios from 'axios-https-proxy-fix'
import Image from './image.js'

class Session {
    static timeout = 15000
    static retry = 3
    static delay = 3000
    static proxy = null
    static get_proxy_text = () => `http://${Session.proxy.host}:${Session.proxy.port}`

    /** @type {import('axios-https-proxy-fix').AxiosInstance} */
    axiosInstance

    #lastRequestTime = 0

    constructor (baseURL, headers = null, cookie = null) {
        this.baseURL = baseURL
        let config = {
            baseURL: baseURL,
            timeout: Session.timeout,
            withCredentials: true,
        }

        if (headers) {
            headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            config.headers = headers
        } else {
            config.headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            }
        }

        if (cookie) {
            if (!config.headers) {
                config.headers = {}
            }
            config.headers.Cookie = serializeObjectToCookieText(cookie)
        }

        if (Session.proxy) {
            config.proxy = {
                host: Session.proxy.host,
                port: Session.proxy.port
            }
        }

        this.axiosInstance = Axios.create(config)

        // 请求拦截器，设置访问间隔
        this.axiosInstance.interceptors.request.use(async (config) => {
            if (!config.url.match(/\.(jpeg|jpg|gif|png|webp)$/)) {
                const timeSinceLastRequest = Date.now() - this.#lastRequestTime

                if (timeSinceLastRequest < Session.delay) {
                    await sleep(Session.delay - timeSinceLastRequest)
                }

                // 更新最后请求时间
                this.#lastRequestTime = Date.now()
            }

            return config
        }, (error) => {
            return Promise.reject(error)
        })
    }

    async get (url, headers = null, cookie = null) {
        let config = {}
        if (headers) {
            config.headers = headers
        }
        if (cookie) {
            if (!config.headers) {
                config.headers = {}
            }
            config.headers.Cookie = serializeObjectToCookieText(cookie)
        }

        //重连次数
        for (let i = 0; i <= Session.retry; i++) {
            try {
                let response = await this.axiosInstance.get(url, config)
                if (response.status === 200) {
                    return response
                }
            } catch (e) {}

            if (i !== Session.retry) {
                let url_ = url.startsWith('/') ? `${this.baseURL}${url}` : url
                console.warn(`请求失败，重试第 ${i + 1} 次: ${url_}`)
            }
        }

        return null
    }

    async post (url, form = null, headers = null, cookie = null) {
        let config = {}
        if (headers) {
            config.headers = headers
        }
        if (cookie) {
            if (!config.headers) {
                config.headers = {}
            }
            config.headers.Cookie = serializeObjectToCookieText(cookie)
        }

        //重连次数
        for (let i = 0; i <= Session.retry; i++) {
            try {
                let response = await this.axiosInstance.post(url, form, config)
                if (response.status === 200) {
                    return response
                }
            } catch (e) {}

            if (i !== Session.retry) {
                let url_ = url.startsWith('/') ? `${this.baseURL}${url}` : url
                console.warn(`请求失败，重试第 ${i + 1} 次: ${url_}`)
            }
        }

        return null
    }

    async getImage (url, headers = null, cookie = null) {
        let config = {
            responseType: 'arraybuffer'
        }
        if (headers) {
            config.headers = headers
        }
        if (cookie) {
            if (!config.headers) {
                config.headers = {}
            }
            config.headers.Cookie = serializeObjectToCookieText(cookie)
        }

        //重连次数
        for (let i = 0; i <= Session.retry; i++) {
            try {
                let response = await this.axiosInstance.get(url, config)
                if (response.status === 200) {
                    return new Image(response.data)
                }
            } catch (e) {}

            if (i !== Session.retry) {
                let url_ = url.startsWith('/') ? `${this.baseURL}${url}` : url
                console.warn(`请求失败，重试第 ${i + 1} 次: ${url_}`)
            }
        }

        return null
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

export default Session
