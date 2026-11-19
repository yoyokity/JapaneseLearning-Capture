import { net, session } from 'electron'
import iconv from 'iconv-lite'
import { z } from 'zod'

/**
 * 请求解析类型
 */
export type IFetchParse = 'arrayBuffer' | 'blob' | 'formData' | 'json' | 'text'

/**
 * 请求选项
 */
export interface IFetchOptions {
    /**
     * 请求头
     */
    headers?: Record<string, string>
    /**
     * 请求超时时间（毫秒）
     */
    timeout?: number
    /**
     * 要把返回的数据解析成什么
     * @default text
     */
    parse?: IFetchParse
}

/**
 * 请求选项结构
 */
export const fetchOptionsSchema = z.object({
    headers: z.record(z.string(), z.string()).optional(),
    timeout: z.number().int().optional(),
    parse: z.enum(['arrayBuffer', 'blob', 'formData', 'json', 'text']).optional()
})

/**
 * 请求结果
 */
export interface IResult<T> {
    ok: boolean
    status: number
    statusText: string
    headers: Record<string, string>
    body: T
}

/**
 * 代理配置
 */
export interface IProxyConfig {
    proxyRules: string
    proxyBypassRules?: string
}

/**
 * 代理配置结构
 */
export const proxyConfigSchema = z.object({
    proxyRules: z.string(),
    proxyBypassRules: z.string().optional()
})

/**
 * Ping 结果
 */
export interface IPingResult {
    /**
     * 是否成功
     */
    success: boolean
    /**
     * 响应时间（毫秒），失败时为 -1
     */
    time: number
    /**
     * HTTP 状态码，失败时为 -1
     */
    status: number
    /**
     * 错误信息，成功时不存在
     */
    error?: string
}

/**
 * 根据解析类型返回对应的数据类型
 */
export type ParseResultType<P extends IFetchParse | undefined> = P extends 'arrayBuffer'
    ? ArrayBuffer
    : P extends 'blob'
      ? Blob
      : P extends 'formData'
        ? FormData
        : P extends 'json'
          ? Record<string, any>
          : P extends 'text'
            ? string
            : P extends undefined
              ? string
              : string

/**
 * 发送请求并兼容超时控制
 * @param url 请求地址
 * @param init 请求配置
 * @param timeout 超时时间
 */
async function request(url: string, init: RequestInit, timeout: number = 7000) {
    return await net.fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeout)
    })
}

/**
 * 解析响应体
 * @param response 响应对象
 * @param parse 解析方式
 */
async function parseResponseBody(response: Response, parse?: IFetchOptions['parse']) {
    if (parse === 'arrayBuffer') {
        return await response.arrayBuffer()
    }

    if (parse === 'blob') {
        return await response.blob()
    }

    if (parse === 'formData') {
        return await response.formData()
    }

    if (parse === 'json') {
        return await response.json()
    }

    return await response.text()
}

/**
 * 发送 GET 请求
 */
export async function get(url: string, options?: IFetchOptions) {
    const response = await request(
        url,
        {
            method: 'GET',
            ...(options?.headers ? { headers: options.headers } : {})
        },
        options?.timeout
    )

    const result: IResult<any> = {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: await parseResponseBody(response, options?.parse)
    }

    return result
}

/**
 * 发送 POST 请求
 */
export async function post(url: string, body: any, options?: IFetchOptions) {
    // 处理请求体
    let _body: any = body
    let headers: Record<string, string> = options?.headers || {}

    // 如果数据是对象，自动转为 JSON
    if (typeof body === 'object' && !(body instanceof ArrayBuffer) && !ArrayBuffer.isView(body)) {
        _body = JSON.stringify(body)
        headers = {
            'Content-Type': 'application/json',
            ...headers
        }
    }

    const response = await request(
        url,
        {
            method: 'POST',
            body: _body,
            headers
        },
        options?.timeout
    )

    const result: IResult<any> = {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: await parseResponseBody(response, options?.parse)
    }

    return result
}

/**
 * 设置 defaultSession 的代理
 */
export async function setProxy(config: IProxyConfig) {
    await session.defaultSession.setProxy(config)
}

/**
 * 取消 defaultSession 的代理设置
 */
export async function clearProxy() {
    await session.defaultSession.setProxy({
        mode: 'direct'
    })
}

/**
 * 清除 defaultSession 的缓存
 */
export async function clearCache() {
    await session.defaultSession.clearCache()
}

export interface CookiesSetDetails {
    /**
     * Cookie 关联的完整请求地址
     * Electron @remark 会基于该地址推导默认的协议、域名和路径
     */
    url: string
    /**
     * 一个或多个cookie的name、value键值对
     */
    value: Record<string, string>
    /**
     * Cookie 生效的域名
     * @remark 例如 `.example.com` 表示当前域名及其子域名都可携带该 Cookie
     */
    domain?: string
    /**
     * Cookie 生效的路径，省略则为空
     * @remark 只有请求路径匹配该值时，浏览器才会附带该 Cookie
     */
    path?: string
    /**
     * 是否标记为 Secure（仅HTTPS 请求会携带）
     * @default false
     */
    secure?: boolean
    /**
     * 是否标记为 HTTP （仅在 HTTP 请求中发送）
     * @default false
     */
    httpOnly?: boolean
    /**
     * 过期时间，单位为秒
     * @remark 通常使用 Unix 时间戳，超过该时间后 Cookie 会失效
     * @remark 省略则为会话 cookie（关闭会话即失效）
     */
    expirationDate?: number
    /**
     * SameSite 策略，用于限制跨站请求时是否发送 Cookie
     * @param no_restriction 允许在所有请求（包括跨站）中发送 cookie
     * @param lax 相对宽松，只在顶级导航（比如点击链接跳转到你的网站）或安全请求方法（如GET）中发送 cookie。普通的图片加载、iframe 里的请求或 AJAX 调用都不会带。
     * @param strict 最严格，完全禁止在任何跨站请求中发送 cookie。必须是完全同站（即地址栏域名一致）的请求才会携带。
     * @param unspecified 效果等同于 lax
     * @default lax
     */
    sameSite?: 'unspecified' | 'no_restriction' | 'lax' | 'strict'
}

/**
 * 设置 defaultSession 的 Cookie
 * @param details Cookie 详情
 */
export async function setCookie(details: CookiesSetDetails) {
    await Promise.all(
        Object.entries(details.value).map(([name, v]) =>
            session.defaultSession.cookies.set({
                ...details,
                name,
                value: v
            })
        )
    )
}

/**
 * Ping 检测网络连通性
 * @param host 主机地址
 * @param timeout 超时时间（毫秒）
 */
export async function ping(host: string, timeout: number = 3000): Promise<IPingResult> {
    try {
        const startTime = Date.now()
        const response = await net.fetch(`http://${host}`, {
            method: 'HEAD',
            signal: AbortSignal.timeout(timeout)
        })
        const endTime = Date.now()

        return {
            success: response.ok,
            time: endTime - startTime,
            status: response.status
        }
    } catch (error) {
        return {
            success: false,
            time: -1,
            status: -1,
            error: (error as Error).message
        }
    }
}

/**
 * 按指定编码输出字节数组
 * @param value 原始字符串
 * @param encoding 字符编码
 */
export function encode(value: string, encoding: string = 'utf-8') {
    const buffer = iconv.encode(value, encoding)
    return Array.from(buffer)
}
