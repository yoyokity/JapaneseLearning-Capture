import type {
    IAiOptions,
    IAiResult,
    IFetchOptions,
    IPingResult,
    IResult,
    IVerifyCookies,
    ParseResultType
} from '@shared'

import { trpcClient } from '@renderer/ipc/func.ts'
import { v7 } from 'uuid'

export type {
    IAiOptions,
    IAiResult,
    IFetchOptions,
    IFetchParse,
    IPingResult,
    IResult,
    IVerifyCookies,
    ParseResultType
} from '@shared'

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
    ): Promise<IResult<ParseResultType<P>>> =>
        trpcClient.net.get.query({
            url,
            options
        }) as Promise<IResult<ParseResultType<P>>>,

    /**
     * 发送 POST 请求
     */
    post: <P extends IFetchOptions['parse'] | undefined = undefined>(
        url: string,
        body: any,
        options?: IFetchOptions & { parse?: P }
    ): Promise<IResult<ParseResultType<P>>> =>
        trpcClient.net.post.mutate({
            url,
            body,
            options
        }) as Promise<IResult<ParseResultType<P>>>,

    /**
     * 发送AI流式请求
     * @param options AI选项
     */
    ai: async (options: IAiOptions): Promise<IAiTask> => {
        const requestId = v7()

        let closed = false
        let isCancelled = false
        let isResolved = false
        let text = ''
        let reasoningText = ''

        let resolveTask!: (value: IAiResult) => void
        let rejectTask!: (reason?: any) => void

        const completed = new Promise<IAiResult>((resolve, reject) => {
            resolveTask = resolve
            rejectTask = reject
        })

        const subscription = trpcClient.net.ai.subscribe(
            {
                provider: options.provider,
                apiKey: options.apiKey,
                model: options.model,
                baseURL: options.baseURL,
                providerOptions: options.providerOptions,
                system: options.system,
                prompt: options.prompt,
                timeout: options.timeout
            },
            {
                onData(payload) {
                    if (payload.type === 'data') {
                        text += payload.data
                        reasoningText += payload.reasoningData ?? ''
                        options.callback?.(payload.data, payload.reasoningData ?? '')
                        return
                    }

                    text = payload.text
                    reasoningText = payload.reasoningText ?? reasoningText
                    if (isResolved) return

                    isResolved = true
                    resolveTask({
                        text,
                        ...(reasoningText ? { reasoningText } : {})
                    })
                },
                onError(error) {
                    if (closed) return

                    closed = true
                    if (isCancelled) {
                        rejectTask(new Error('AI流已取消'))
                        return
                    }

                    rejectTask(error)
                },
                onComplete() {
                    if (closed) return

                    closed = true
                    if (isCancelled || isResolved) {
                        return
                    }

                    isResolved = true
                    resolveTask({
                        text,
                        ...(reasoningText ? { reasoningText } : {})
                    })
                }
            }
        )

        return {
            requestId,
            completed,
            cancel: async () => {
                isCancelled = true
                closed = true
                subscription.unsubscribe()
                rejectTask(new Error('AI流已取消'))
            },
            getText: () => ({
                text,
                ...(reasoningText ? { reasoningText } : {})
            })
        }
    },

    /**
     * 设置默认会话的代理
     * @param config 代理配置
     * @param config.proxyRules 代理规则字符串，例如 "http=foopy:80;https=foopy:80;"
     * @param config.proxyBypassRules 可选的代理绕过规则，例如 "*.example.com,internal.local"
     */
    setProxy: (config: { proxyRules: string; proxyBypassRules?: string }): Promise<void> =>
        trpcClient.net.setProxy.mutate(config),

    /**
     * 取消默认会话的代理设置
     */
    clearProxy: (): Promise<void> => trpcClient.net.clearProxy.mutate(),

    /**
     * 清除默认会话的缓存
     */
    clearCache: (): Promise<void> => trpcClient.net.clearCache.mutate(),

    /**
     * Ping检测网络连通性
     * @param host 主机地址
     * @param timeout 超时时间（毫秒），默认为3000ms
     * @returns 返回ping结果，包含是否成功、响应时间和状态码
     */
    ping: (host: string, timeout?: number): Promise<IPingResult> =>
        trpcClient.net.ping.query({
            host,
            timeout
        }),

    /**
     * 打开 Cloudflare 验证窗口
     * @param url 需要验证的网站 URL
     * @param targetCookies 目标 Cookie 名称数组，检测到所有 Cookie 后自动关闭窗口，默认为 ['XSRF-TOKEN']
     * @returns 返回验证结果，包含 Cookie 信息
     */
    cloudflareVerify: (url: string, targetCookies?: string[]): Promise<IVerifyCookies> =>
        trpcClient.net.cloudflareVerify.mutate({
            url,
            targetCookies
        }),

    /**
     * 按指定编码输出字节数组
     * @param value 原始字符串
     * @param encoding 字符编码，默认为 utf-8
     */
    encode: (value: string, encoding: string = 'utf-8'): Promise<number[]> =>
        trpcClient.net.encode.query({
            value,
            encoding
        })
}

export interface IAiTask {
    requestId: string
    completed: Promise<IAiResult>
    cancel: () => Promise<void>
    getText: () => IAiResult
}
