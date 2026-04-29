import { createDeepSeek } from '@ai-sdk/deepseek'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { observable } from '@trpc/server/observable'
import { streamText } from 'ai'
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
 * Cloudflare 验证结果
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

// #region AI
/**
 * AI 启动参数
 */
export interface IAiStartOptions {
    /**
     * AI 提供商
     */
    provider: 'openai' | 'deepseek' | 'gemini'
    /**
     * API Key
     */
    apiKey: string
    /**
     * 模型名称
     */
    model: string
    /**
     * OpenAI 兼容接口地址
     */
    baseURL?: string
    /**
     * 其他特定于提供商的选项
     */
    providerOptions?: Record<string, any>
    /**
     * 系统提示词
     */
    system?: string
    /**
     * 用户输入
     */
    prompt: string
    /**
     * 超时时间（毫秒）
     */
    timeout?: number
}

/**
 * AI 请求选项
 */
export interface IAiOptions extends IAiStartOptions {
    /**
     * 流式回调
     */
    callback?: (data: string, reasoningData: string) => void
}

/**
 * AI 启动参数结构
 */
export const aiStartOptionsSchema = z.object({
    provider: z.enum(['openai', 'deepseek', 'gemini']),
    apiKey: z.string(),
    model: z.string(),
    baseURL: z.string().optional(),
    providerOptions: z.record(z.string(), z.any()).optional(),
    system: z.string().optional(),
    prompt: z.string(),
    timeout: z.number().int().optional()
})

/**
 * AI 最终结果
 */
export interface IAiResult {
    text: string
    reasoningText?: string
}

/**
 * AI 流式数据块
 */
export interface IAiDataPayload {
    type: 'data'
    data: string
    reasoningData?: string
}

/**
 * AI 流式结束数据
 */
export interface IAiEndPayload {
    type: 'end'
    text: string
    reasoningText?: string
}

/**
 * AI 流式响应
 */
export type IAiStreamPayload = IAiDataPayload | IAiEndPayload

/**
 * 适配 AI SDK 要求的 fetch 签名
 * @param input 请求地址
 * @param init 请求配置
 */
function aiFetch(input: RequestInfo | URL, init?: RequestInit) {
    const requestInput = input instanceof URL ? input.toString() : input
    return net.fetch(requestInput, init)
}

/**
 * 获取 AI 模型实例
 * @param options AI 配置
 */
function getAiModel(options: IAiStartOptions) {
    // openai
    if (options.provider === 'openai') {
        const provider = createOpenAI({
            apiKey: options.apiKey,
            fetch: aiFetch,
            ...(options.baseURL ? { baseURL: options.baseURL } : {})
        })

        return provider(options.model)
    }

    // deepseek
    if (options.provider === 'deepseek') {
        const provider = createDeepSeek({
            apiKey: options.apiKey,
            fetch: aiFetch
        })

        return provider(options.model)
    }

    // gemini
    const provider = createGoogleGenerativeAI({
        apiKey: options.apiKey,
        fetch: aiFetch
    })

    return provider(options.model)
}

/**
 * 创建 AI 流式请求
 */
export function createAiStream(options: IAiStartOptions) {
    return observable<IAiStreamPayload>((emit) => {
        const controller = new AbortController()
        const timeout = options.timeout || 7000
        let timeoutId: ReturnType<typeof setTimeout> | null = null
        let timeoutMessage = 'AI流请求超时：未连接成功或未收到首个数据块'
        let isStopped = false

        /**
         * 重置流超时计时器
         * @param errorMessage 超时错误信息
         */
        function resetStreamTimeout(errorMessage: string) {
            if (timeoutId) {
                clearTimeout(timeoutId)
            }

            timeoutMessage = errorMessage
            timeoutId = setTimeout(() => {
                controller.abort()
            }, timeout)
        }

        resetStreamTimeout('AI流请求超时：未连接成功或未收到首个数据块')

        void (async () => {
            try {
                const result = streamText({
                    model: getAiModel(options),
                    prompt: options.prompt,
                    abortSignal: controller.signal,
                    ...(options.providerOptions
                        ? { providerOptions: options.providerOptions }
                        : {}),
                    ...(options.system ? { system: options.system } : {})
                })
                let hasFirstChunk = false
                let fullText = ''
                let fullReasoningText = ''

                for await (const part of result.fullStream) {
                    if (part.type !== 'text-delta' && part.type !== 'reasoning-delta') {
                        continue
                    }

                    if (!hasFirstChunk) {
                        hasFirstChunk = true
                    }

                    resetStreamTimeout(
                        hasFirstChunk
                            ? 'AI流请求超时：连续一段时间未收到新的数据块'
                            : 'AI流请求超时：未连接成功或未收到首个数据块'
                    )

                    if (part.type === 'text-delta') {
                        fullText += part.text

                        const dataPayload: IAiDataPayload = {
                            type: 'data',
                            data: part.text
                        }
                        emit.next(dataPayload)
                        continue
                    }

                    fullReasoningText += part.text

                    const dataPayload: IAiDataPayload = {
                        type: 'data',
                        data: '',
                        reasoningData: part.text
                    }
                    emit.next(dataPayload)
                }

                fullReasoningText = (await result.reasoningText) ?? ''

                const endPayload: IAiEndPayload = {
                    type: 'end',
                    text: fullText,
                    ...(fullReasoningText ? { reasoningText: fullReasoningText } : {})
                }
                emit.next(endPayload)
                isStopped = true
                emit.complete()
            } catch (error) {
                emit.error(
                    new Error(
                        controller.signal.aborted
                            ? timeoutMessage || 'AI流请求已取消'
                            : (error as Error).message
                    )
                )
            } finally {
                if (timeoutId) {
                    clearTimeout(timeoutId)
                }
            }
        })()

        return {
            unsubscribe() {
                if (isStopped || controller.signal.aborted) {
                    return
                }
                timeoutMessage = 'AI流请求已取消'
                controller.abort()
            }
        }
    })
}

// #endregion AI
