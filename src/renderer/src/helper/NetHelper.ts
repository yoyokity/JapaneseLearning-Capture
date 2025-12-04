import type {
    IFetchOptions,
    IFetchParse,
    IPingResult,
    IResult,
    IVerifyCookies,
    ParseResultType
} from '@renderer/ipc/net.ts'

import { DebugHelper } from '@renderer/helper/DebugHelper.ts'
import { Ipc } from '@renderer/ipc'
import { settingsStore } from '@renderer/stores'

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
        // 如果基础 URL 没有以斜杠结尾，先加上一个，方便后续拼接
        const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`

        const url = new URL(base)

        for (const segment of pathSegments) {
            // 移除路径片段开头和结尾的斜杠，避免重复
            const cleanedSegment = segment.replace(/^\/|\/$/g, '')
            if (cleanedSegment) {
                url.pathname = `${url.pathname}/${cleanedSegment}`
            }
        }

        // 返回最终的 URL 字符串
        return url.toString()
    }

    /**
     * 设置代理
     */
    static async setProxy(enable: boolean, host: string, port: string) {
        if (enable && host && port) {
            const proxyRules = `http://${host}:${port}`
            const proxyBypassRules = 'localhost'

            const re = await DebugHelper.tryExecute(Ipc.net.setProxy, {
                proxyRules,
                proxyBypassRules
            })
            if (!re.hasError) {
                DebugHelper.info(`设置网络代理成功：`, proxyRules)
            } else {
                DebugHelper.error(`设置网络代理失败：`, re.error)
            }
        } else {
            const re = await DebugHelper.tryExecute(Ipc.net.clearProxy)
            if (!re.hasError) {
                DebugHelper.info(`取消网络代理`)
            } else {
                DebugHelper.error(`取消网络代理失败：`, re.error)
            }
        }
    }

    /**
     * GET请求
     * @param url
     * @param [parse] 将返回的body数据解析成什么类型
     * @param headers
     * @param [options] 请求选项，当前请求会覆盖掉settings设置的
     * @return 只有status在200-299之间，ok字段才为true
     * @example
     * ```ts
     * const re = await NetHelper.get('https://www.google.com')
     * if (re.ok) {
     *     console.log(re.body)
     * }
     * ```
     */
    static async get<P extends IFetchParse = 'text'>(
        url: string,
        parse?: P,
        headers?: Record<string, string>,
        options?: IRequestOptions
    ): Promise<IResult<ParseResultType<P>>> {
        const settings = settingsStore()
        let timeout: number = settings.net.timeout * 1000
        let delay: number = settings.net.delay
        let retry: number = settings.net.retry

        if (options) {
            timeout = options.timeout || options.timeout === 0 ? options.timeout : timeout
            delay = options.delay || options.delay === 0 ? options.delay : delay
            retry = options.retry || options.retry === 0 ? options.retry : retry
        }

        const defaultHeaders = {
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        }

        const config: IFetchOptions = {
            headers: { ...defaultHeaders, ...headers },
            timeout,
            parse: parse || ('text' as P)
        }

        let re
        let retryCount = 0

        // 失败则重试
        do {
            if (retryCount > 0) {
                DebugHelper.warn(`GET请求重试第${retryCount}次：${url}`)
            }

            if (retry > 0) {
                const hostName = new URL(url).hostname
                re = await DebugHelper.queueWithInterval(hostName, delay, false, async () =>
                    DebugHelper.tryExecute(async () => await Ipc.net.get(url, config))
                )
            } else {
                re = await DebugHelper.tryExecute(async () => await Ipc.net.get(url, config))
            }

            if (!re.hasError) {
                const result = re.result as IResult<ParseResultType<P>>
                if (result.ok || result.status === 403) {
                    return result
                }
            } else {
                DebugHelper.error(`GET请求失败：${url}`, re.error)
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
     * @param url
     * @param data 请求体body数据
     * @param [parse] 将返回的body数据解析成什么类型
     * @param headers
     * @param [options] 请求选项，当前请求会覆盖掉settings设置的
     * @return 只有status在200-299之间，ok字段才为true
     * @example
     * ```ts
     * const re = await NetHelper.post('https://api.example.com', { name: 'test' })
     * if (re.ok) {
     *     console.log(re.body)
     * }
     * ```
     */
    static async post<P extends IFetchParse = 'text'>(
        url: string,
        data: any,
        parse?: P,
        headers?: Record<string, string>,
        options?: IRequestOptions
    ): Promise<IResult<ParseResultType<P>>> {
        const settings = settingsStore()
        let timeout: number = settings.net.timeout * 1000
        let delay: number = settings.net.delay
        let retry: number = settings.net.retry

        if (options) {
            timeout = options.timeout || options.timeout === 0 ? options.timeout : timeout
            delay = options.delay || options.delay === 0 ? options.delay : delay
            retry = options.retry || options.retry === 0 ? options.retry : retry
        }

        const defaultHeaders = {
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        }

        const config: IFetchOptions = {
            headers: { ...defaultHeaders, ...headers },
            timeout,
            parse: parse || ('text' as P)
        }

        let re
        let retryCount = 0

        // 失败则重试
        do {
            if (retryCount > 0) {
                DebugHelper.warn(`POST请求重试第${retryCount}次：${url}`)
            }

            if (retry > 0) {
                const hostName = new URL(url).hostname
                re = await DebugHelper.queueWithInterval(hostName, delay, false, async () =>
                    DebugHelper.tryExecute(async () => await Ipc.net.post(url, data, config))
                )
            } else {
                re = await DebugHelper.tryExecute(async () => await Ipc.net.post(url, data, config))
            }

            if (!re.hasError) {
                const result = re.result as IResult<ParseResultType<P>>
                if (result.ok || result.status === 403) {
                    return result
                } else {
                    DebugHelper.warn(`POST请求失败：${url}`, re.result)
                }
            } else {
                DebugHelper.error(`POST请求失败：${url}`, re.error)
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

        const re = await DebugHelper.tryExecute(async () => await Ipc.net.ping(host, pingTimeout))

        if (!re.hasError) {
            return re.result as IPingResult
        } else {
            DebugHelper.error(`Ping请求失败：${host}`, re.error)
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
        const re = await DebugHelper.tryExecute(
            async () => await Ipc.net.cloudflareVerify(url, targetCookies)
        )

        if (!re.hasError) {
            return re.result as IVerifyCookies
        } else {
            DebugHelper.error(`验证失败：${url}`, re.error)
            return {
                success: false,
                cookies: '',
                targetCookies: {},
                error: `执行错误: ${re.error}`
            }
        }
    }
}

export interface IRequestOptions {
    /**
     * 请求超时时间
     */
    timeout?: number
    /**
     * 重试次数
     */
    retry?: number
    /**
     * 每次相同网站的请求间隔
     */
    delay?: number
}
