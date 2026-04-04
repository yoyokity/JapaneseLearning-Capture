import { invoke } from '@renderer/ipc/func.ts'

/**
 * 网络相关接口
 */
export const net = {
    /**
     * 发送 GET 请求
     * @param url
     * @param options 选项
     * @param options.headers 请求头
     * @param options.timeout 超时时间，默认为 7s
     * @param options.parse 要把返回的数据解析成什么，默认为 text
     */
    get: <P extends IFetchOptions['parse'] | undefined = undefined>(
        url: string,
        options?: IFetchOptions & { parse?: P }
    ): Promise<IResult<ParseResultType<P>>> => invoke('net:get', url, options),

    /**
     * 发送 POST 请求
     */
    post: <P extends IFetchOptions['parse'] | undefined = undefined>(
        url: string,
        body: any,
        options?: IFetchOptions & { parse?: P }
    ): Promise<IResult<ParseResultType<P>>> => invoke('net:post', url, body, options),

    /**
     * 设置默认会话的代理
     * @param config 代理配置
     * @param config.proxyRules 代理规则字符串，例如 "http=foopy:80;https=foopy:80;"
     * @param config.proxyBypassRules 可选的代理绕过规则，例如 "*.example.com,internal.local"
     */
    setProxy: (config: { proxyRules: string; proxyBypassRules?: string }): Promise<void> =>
        invoke('net:setProxy', config),

    /**
     * 取消默认会话的代理设置
     */
    clearProxy: (): Promise<void> => invoke('net:clearProxy'),

    /**
     * 清除默认会话的缓存
     */
    clearCache: (): Promise<void> => invoke('net:clearCache'),

    /**
     * Ping检测网络连通性
     * @param host 主机地址
     * @param timeout 超时时间（毫秒），默认为3000ms
     * @returns 返回ping结果，包含是否成功、响应时间和状态码
     */
    ping: (host: string, timeout?: number): Promise<IPingResult> =>
        invoke('net:ping', host, timeout),

    /**
     * 打开 Cloudflare 验证窗口
     * @param url 需要验证的网站 URL
     * @param targetCookies 目标 Cookie 名称数组，检测到所有 Cookie 后自动关闭窗口，默认为 ['XSRF-TOKEN']
     * @returns 返回验证结果，包含 Cookie 信息
     */
    cloudflareVerify: (url: string, targetCookies?: string[]): Promise<IVerifyCookies> =>
        invoke('cloudflare:verify', url, targetCookies),

    /**
     * 按指定编码输出字节数组
     * @param value 原始字符串
     * @param encoding 字符编码，默认为 utf-8
     */
    encode: (value: string, encoding: string = 'utf-8'): Promise<number[]> =>
        invoke('net:encode', value, encoding)
}

/**
 * 请求选项接口
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

export type IFetchParse = 'arrayBuffer' | 'blob' | 'formData' | 'json' | 'text'

export interface IResult<T> {
    ok: boolean
    status: number
    statusText: string
    headers: Record<string, string>
    body: T
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
 * Ping结果接口
 */
export interface IPingResult {
    /**
     * 是否成功
     */
    success: boolean

    /**
     * 响应时间（毫秒），失败时为-1
     */
    time: number

    /**
     * HTTP状态码，失败时为-1
     */
    status: number

    /**
     * 错误信息，成功时不存在
     */
    error?: string
}

/**
 * Cloudflare 验证结果接口
 */
export interface IVerifyCookies {
    /**
     * 是否验证成功
     */
    success: boolean

    /**
     * Cookie 字符串
     */
    cookies: string

    /**
     * 获取到的目标 Cookie 键值对
     */
    targetCookies: Record<string, string>

    /**
     * 错误信息
     */
    error?: string
}
