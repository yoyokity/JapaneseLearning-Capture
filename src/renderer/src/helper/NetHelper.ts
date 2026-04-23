import type {
    IFetchOptions,
    IFetchParse,
    IPingResult,
    IResult,
    IVerifyCookies,
    ParseResultType
} from '@renderer/ipc/net.ts'

import { Ipc } from '@renderer/ipc'
import { settingsStore } from '@renderer/stores'

import { LogHelper, TaskHelper } from '.'

/**
 * 网络相关
 */
export class NetHelper {
    /**
     * 安全地拼接多个路径片段到基础URL上。
     * @param baseUrl 基础 URL，例如 'https://api.example.com'。
     * @param pathSegments 任意数量的路径片段，例如 '/users', '123', 'profile/'。
     * @returns 拼接好的 URL 字符串。
     */
    static joinUrl(baseUrl: string, ...pathSegments: string[]): string {
        // 1. 去掉 baseUrl 尾部的所有斜杠
        let url = baseUrl.replace(/\/+$/, '')

        for (const segment of pathSegments) {
            // 2. 去掉 segment 首尾的所有斜杠
            const cleanSegment = segment.replace(/^\/+|\/+$/g, '')

            // 3. 仅当片段非空时拼接
            if (cleanSegment) {
                url += `/${cleanSegment}`
            }
        }

        return url
    }

    /**
     * 设置代理
     */
    static async setProxy(enable: boolean, host: string, port: string) {
        if (enable && host && port) {
            const proxyRules = `http://${host}:${port}`
            const proxyBypassRules = 'localhost'

            const re = await TaskHelper.tryExecute(Ipc.net.setProxy, {
                proxyRules,
                proxyBypassRules
            })
            if (!re.hasError) {
                LogHelper.success(`设置网络代理成功：`, proxyRules)
            } else {
                LogHelper.error(`设置网络代理失败：`, re.error)
            }
        } else {
            const re = await TaskHelper.tryExecute(Ipc.net.clearProxy)
            if (!re.hasError) {
                LogHelper.success(`取消网络代理`)
            } else {
                LogHelper.error(`取消网络代理失败：`, re.error)
            }
        }
    }

    /**
     * 将cookie对象转换为cookie字符串
     */
    private static _cookieToString(cookie: Record<string, string>): string {
        return Object.entries(cookie)
            .map(([key, value]) => `${key}=${value}`)
            .join('; ')
    }

    /**
     * GET请求
     * @param url 请求地址
     * @param options 请求选项
     * @return 只有status在200-299之间，ok字段才为true
     * @example
     * ```ts
     * const re = await NetHelper.get('https://www.google.com')
     * if (re.ok) {
     *     console.log(re.body)
     * }
     *
     * // 带选项的请求
     * const re = await NetHelper.get('https://api.example.com', {
     *     parse: 'json',
     *     headers: { 'Authorization': 'Bearer token' },
     *     cookie: { session: 'abc123' }
     * })
     * ```
     */
    static async get<P extends IFetchParse = 'text'>(
        url: string,
        options?: IRequestOptions<P>
    ): Promise<IResult<ParseResultType<P>>> {
        const settings = settingsStore()
        let timeout: number = settings.net.timeout * 1000
        let delay: number = settings.net.delay
        let retry: number = settings.net.retry
        let parse: IFetchParse = 'text'
        let headers: Record<string, string> = {}

        if (options) {
            timeout = options.timeout ?? timeout
            delay = options.delay ?? delay
            retry = options.retry ?? retry
            parse = options.parse ?? parse
            headers = options.headers ?? headers

            // 处理cookie
            if (options.cookie) {
                const cookieStr = this._cookieToString(options.cookie)
                headers.cookie = headers.cookie ? `${headers.cookie}; ${cookieStr}` : cookieStr
            }
        }

        const defaultHeaders = {
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        }

        const config: IFetchOptions = {
            headers: { ...defaultHeaders, ...headers },
            timeout,
            parse: parse as P
        }

        let re
        let retryCount = 0

        // 失败则重试
        do {
            if (retryCount > 0) {
                LogHelper.warn(`GET请求重试第${retryCount}次：${url}`)
            }

            if (retry > 0) {
                const hostName = new URL(url).hostname
                re = await TaskHelper.queueWithCancel(
                    {
                        taskName: hostName,
                        intervalMs: delay,
                        updateTimeAfterExecution: false
                    },
                    async () => TaskHelper.tryExecute(async () => await Ipc.net.get(url, config))
                )
            } else {
                re = await TaskHelper.tryExecute(async () => await Ipc.net.get(url, config))
            }

            if (!re.hasError) {
                const result = re.result as IResult<ParseResultType<P>>
                if (result.ok || result.status === 403) {
                    return result
                }
            } else {
                LogHelper.error(`GET请求失败：${url}`, re.error)
            }

            retryCount++
        } while (retryCount <= retry)

        return {
            ok: false,
            status: -1,
            statusText: '',
            headers: {},
            body: undefined as any
        }
    }

    /**
     * POST请求
     * @param url 请求地址
     * @param data 请求体body数据
     * @param options 请求选项
     * @return 只有status在200-299之间，ok字段才为true
     * @example
     * ```ts
     * const re = await NetHelper.post('https://api.example.com', { name: 'test' })
     * if (re.ok) {
     *     console.log(re.body)
     * }
     *
     * // 带选项的请求
     * const re = await NetHelper.post('https://api.example.com', { name: 'test' }, {
     *     parse: 'json',
     *     headers: { 'Content-Type': 'application/json' }
     * })
     * ```
     */
    static async post<P extends IFetchParse = 'text'>(
        url: string,
        data: any,
        options?: IRequestOptions<P>
    ): Promise<IResult<ParseResultType<P>>> {
        const settings = settingsStore()
        let timeout: number = settings.net.timeout * 1000
        let delay: number = settings.net.delay
        let retry: number = settings.net.retry
        let parse: IFetchParse = 'text'
        let headers: Record<string, string> = {}

        if (options) {
            timeout = options.timeout ?? timeout
            delay = options.delay ?? delay
            retry = options.retry ?? retry
            parse = options.parse ?? parse
            headers = options.headers ?? headers

            // 处理cookie
            if (options.cookie) {
                const cookieStr = this._cookieToString(options.cookie)
                headers.cookie = headers.cookie ? `${headers.cookie}; ${cookieStr}` : cookieStr
            }
        }

        const defaultHeaders = {
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        }

        const config: IFetchOptions = {
            headers: { ...defaultHeaders, ...headers },
            timeout,
            parse: parse as P
        }

        let re
        let retryCount = 0

        // 失败则重试
        do {
            if (retryCount > 0) {
                LogHelper.warn(`POST请求重试第${retryCount}次：${url}`)
            }

            if (retry > 0) {
                const hostName = new URL(url).hostname
                re = await TaskHelper.queueWithCancel(
                    {
                        taskName: hostName,
                        intervalMs: delay,
                        updateTimeAfterExecution: false
                    },
                    async () =>
                        TaskHelper.tryExecute(async () => await Ipc.net.post(url, data, config))
                )
            } else {
                re = await TaskHelper.tryExecute(async () => await Ipc.net.post(url, data, config))
            }

            if (!re.hasError) {
                const result = re.result as IResult<ParseResultType<P>>
                if (result.ok || result.status === 403) {
                    return result
                } else {
                    LogHelper.warn(`POST请求失败：${url}`, re.result)
                }
            } else {
                LogHelper.error(`POST请求失败：${url}`, re.error)
            }

            retryCount++
        } while (retryCount <= retry)

        return {
            ok: false,
            status: -1,
            statusText: '',
            headers: {},
            body: undefined as any
        }
    }

    /**
     * 图片请求，忽略请求之间的间隔
     * @param url 请求地址
     * @param options 请求选项（parse字段会被忽略，固定为arrayBuffer）
     */
    static async getImage(url: string, options?: Omit<IRequestOptions, 'parse' | 'delay'>) {
        const settings = settingsStore()
        let timeout: number = settings.net.timeout * 1000
        let retry: number = settings.net.retry
        let headers: Record<string, string> = {}

        if (options) {
            timeout = options.timeout ?? timeout
            retry = options.retry ?? retry
            headers = options.headers ?? headers

            // 处理cookie
            if (options.cookie) {
                const cookieStr = this._cookieToString(options.cookie)
                headers.cookie = headers.cookie ? `${headers.cookie}; ${cookieStr}` : cookieStr
            }
        }

        const defaultHeaders = {
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        }

        const config: IFetchOptions = {
            headers: { ...defaultHeaders, ...headers },
            timeout,
            parse: 'arrayBuffer'
        }

        let re
        let retryCount = 0

        // 失败则重试
        do {
            if (retryCount > 0) {
                LogHelper.warn(`GET请求重试第${retryCount}次：${url}`)
            }

            re = await TaskHelper.tryExecute(async () => await Ipc.net.get(url, config))

            if (!re.hasError) {
                const result = re.result as IResult<ArrayBuffer>
                if (result.ok || result.status === 403) {
                    return result
                }
            } else {
                LogHelper.error(`GET请求失败：${url}`, re.error)
            }

            retryCount++
        } while (retryCount <= retry)

        return {
            ok: false,
            status: -1,
            statusText: '',
            headers: {},
            body: undefined as any
        }
    }

    /**
     * Ping检测网络连通性
     * @param host 主机地址（不包含协议前缀）
     * @param [timeout] 超时时间（毫秒），默认使用设置中的超时时间
     * @returns 返回ping结果，包含是否成功、响应时间和状态码
     * @example
     * ```ts
     * const re = await NetHelper.ping('www.google.com')
     * if (re.success) {
     *     console.log(`响应时间: ${re.time}ms`)
     * } else {
     *     console.log(`连接失败: ${re.error}`)
     * }
     * ```
     */
    static async ping(host: string, timeout?: number): Promise<IPingResult> {
        const settings = settingsStore()
        const pingTimeout = timeout || settings.net.timeout * 1000

        const re = await TaskHelper.tryExecute(async () => await Ipc.net.ping(host, pingTimeout))

        if (!re.hasError) {
            return re.result as IPingResult
        } else {
            LogHelper.error(`Ping请求失败：${host}`, re.error)
            return {
                success: false,
                time: -1,
                status: -1,
                error: `执行错误: ${re.error}`
            }
        }
    }

    /**
     * 打开一个新窗口来获取一些验证相关的cookie
     * @param url 需要验证的网站 URL
     * @param targetCookies 目标 Cookie 名称数组，检测到所有 Cookie 后自动关闭窗口，默认为 ['XSRF-TOKEN']
     * @returns 返回验证结果，包含 Cookie 信息
     */
    static async verify(url: string, targetCookies?: string[]): Promise<IVerifyCookies> {
        const re = await TaskHelper.tryExecute(
            async () => await Ipc.net.cloudflareVerify(url, targetCookies)
        )

        if (!re.hasError) {
            return re.result as IVerifyCookies
        } else {
            LogHelper.error(`验证失败：${url}`, re.error)
            return {
                success: false,
                cookies: '',
                targetCookies: {},
                error: `执行错误: ${re.error}`
            }
        }
    }
}

export interface IRequestOptions<P extends IFetchParse = 'text'> {
    /**
     * 将返回的body数据解析成什么类型
     */
    parse?: P
    /**
     * 请求头
     */
    headers?: Record<string, string>
    /**
     * Cookie对象，会自动转换为cookie字符串并添加到headers中
     */
    cookie?: Record<string, string>
    /**
     * 请求超时时间（毫秒）
     */
    timeout?: number
    /**
     * 重试次数
     */
    retry?: number
    /**
     * 每次相同网站的请求间隔（毫秒）
     */
    delay?: number
}
