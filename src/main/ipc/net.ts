import { createDeepSeek } from '@ai-sdk/deepseek'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { streamText } from 'ai'
import { ipcMain, net, session } from 'electron'
import iconv from 'iconv-lite'

import { tryExecute } from './func'

// 定义兼容的请求选项类型
interface IFetchOptions {
    headers?: Record<string, string>
    timeout?: number
    parse?: 'arrayBuffer' | 'blob' | 'formData' | 'json' | 'text'
}

interface IResult<T> {
    ok: boolean
    status: number
    statusText: string
    headers: Record<string, string>
    body: T
}

interface IAiStartOptions {
    provider: 'openai' | 'deepseek' | 'gemini'
    apiKey: string
    model: string
    baseURL?: string
    providerOptions?: Record<string, any>
    system?: string
    prompt: string
    timeout?: number
}

interface IAiDataPayload {
    requestId: string
    data: string
    reasoningData?: string
}

interface IAiEndPayload {
    requestId: string
    text: string
    reasoningText?: string
}

interface IAiErrorPayload {
    requestId: string
    error: string
}

const streamControllerMap = new Map<string, AbortController>()
const streamTimeoutMessageMap = new Map<string, string>()

/**
 * 适配AI SDK要求的fetch签名
 * @param input 请求地址
 * @param init 请求配置
 */
function aiFetch(input: RequestInfo | URL, init?: RequestInit) {
    const requestInput = input instanceof URL ? input.toString() : input
    return net.fetch(requestInput, init)
}

/**
 * 获取AI模型实例
 * @param options AI配置
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
ipcMain.handle('net:get', async (_, url: string, options?: IFetchOptions) => {
    return await tryExecute(async () => {
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
    })
})

/**
 * 发送 POST 请求
 */
ipcMain.handle('net:post', async (_, url: string, body: any, options?: IFetchOptions) => {
    return await tryExecute(async () => {
        // 处理请求体
        let _body: any = body
        let headers: Record<string, string> = options?.headers || {}

        // 如果数据是对象，自动转为 JSON
        if (
            typeof body === 'object' &&
            !(body instanceof ArrayBuffer) &&
            !ArrayBuffer.isView(body)
        ) {
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
    })
})

/**
 * 发送AI流式请求
 */
ipcMain.handle('net:ai', async (event, requestId: string, options: IAiStartOptions) => {
    return await tryExecute(async () => {
        const controller = new AbortController()
        const timeout = options.timeout || 7000
        let timeoutId: ReturnType<typeof setTimeout> | null = null

        /**
         * 重置流超时计时器
         * @param errorMessage 超时错误信息
         */
        function resetStreamTimeout(errorMessage: string) {
            if (timeoutId) {
                clearTimeout(timeoutId)
            }

            streamTimeoutMessageMap.set(requestId, errorMessage)
            timeoutId = setTimeout(() => {
                controller.abort()
            }, timeout)
        }

        streamControllerMap.set(requestId, controller)
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
                            requestId,
                            data: part.text
                        }
                        event.sender.send('net:ai:data', dataPayload)
                        continue
                    }

                    fullReasoningText += part.text

                    const dataPayload: IAiDataPayload = {
                        requestId,
                        data: '',
                        reasoningData: part.text
                    }
                    event.sender.send('net:ai:data', dataPayload)
                }

                fullReasoningText = (await result.reasoningText) ?? ''

                const endPayload: IAiEndPayload = {
                    requestId,
                    text: fullText,
                    ...(fullReasoningText ? { reasoningText: fullReasoningText } : {})
                }
                event.sender.send('net:ai:end', endPayload)
            } catch (error) {
                const errorPayload: IAiErrorPayload = {
                    requestId,
                    error: controller.signal.aborted
                        ? (streamTimeoutMessageMap.get(requestId) ?? 'AI流请求已取消')
                        : (error as Error).message
                }
                event.sender.send('net:ai:error', errorPayload)
            } finally {
                if (timeoutId) {
                    clearTimeout(timeoutId)
                }
                streamControllerMap.delete(requestId)
                streamTimeoutMessageMap.delete(requestId)
            }
        })()

        return { requestId }
    })
})

/**
 * 取消AI流式请求
 */
ipcMain.handle('net:aiCancel', async (_, requestId: string) => {
    return await tryExecute(async () => {
        streamTimeoutMessageMap.set(requestId, 'AI流请求已取消')

        streamControllerMap.get(requestId)?.abort()
        streamControllerMap.delete(requestId)
    })
})

/**
 * 设置defaultSession的代理
 */
ipcMain.handle(
    'net:setProxy',
    async (
        _,
        config: {
            proxyRules: string
            proxyBypassRules?: string
        }
    ) => {
        return await tryExecute(async () => {
            await session.defaultSession.setProxy(config)
        })
    }
)

/**
 * 取消defaultSession的代理设置
 */
ipcMain.handle('net:clearProxy', async () => {
    return await tryExecute(async () => {
        await session.defaultSession.setProxy({
            mode: 'direct'
        })
    })
})

/**
 * 清除defaultSession的缓存
 */
ipcMain.handle('net:clearCache', async () => {
    return await tryExecute(session.defaultSession.clearCache)
})

/**
 * Ping检测网络连通性
 * @param host 主机地址
 * @param timeout 超时时间（毫秒）
 */
ipcMain.handle('net:ping', async (_, host: string, timeout: number = 3000) => {
    return await tryExecute(async () => {
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
    })
})

/**
 * 按指定编码输出字节数组
 * @param value 原始字符串
 * @param encoding 字符编码
 */
ipcMain.handle('net:encode', async (_, value: string, encoding: string = 'utf-8') => {
    return await tryExecute(async () => {
        const buffer = iconv.encode(value, encoding)
        return Array.from(buffer)
    })
})
