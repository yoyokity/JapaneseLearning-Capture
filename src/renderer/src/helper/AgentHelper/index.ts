import type { IAgentConfig, IAgentMessage, IAgentResult, IAgentRetryPayload } from '@shared'
import type { ISearchToolConfig } from '../SearchConfig.ts'

import { ipc } from '@renderer/ipc'
import { isAgentSuccess } from '@shared'

import { LogHelper } from '../LogHelper.ts'
import { TaskHelper } from '../TaskHelper.ts'

export type TAgentStreamCallback = (data: string, reasoningData: string, reset?: boolean) => void

export interface IAgentRequestOptions {
    /** 连接配置 */
    config: IAgentConfig
    /** 系统提示词 */
    system?: string | undefined
    /** 超时时间（毫秒） */
    timeout?: number | undefined
    /** 最大重试次数 */
    maxRetries?: number | undefined
    /** 会话来源标记 */
    source?: string | undefined
    /** 是否跳过 AI 日志记录 */
    skipLog?: boolean | undefined
    /** 流式回调 */
    callback?: TAgentStreamCallback | undefined
    /** 重试回调 */
    onRetry?: ((info: IAgentRetryPayload) => void) | undefined
    /** 取消信号 */
    signal?: AbortSignal | undefined
    /** 联网搜索配置，未设置时不启用搜索工具 */
    search?: ISearchToolConfig | undefined
}

export interface IAgentAskOptions extends IAgentRequestOptions {
    /** 用户输入 */
    prompt: string
}

export interface IAgentChatOptions extends IAgentRequestOptions {
    /** 历史消息 */
    messages: IAgentMessage[]
}

/** 获取重试提示文案 */
export function getRetryMessage(info: IAgentRetryPayload) {
    if (info.reason === 'stream_idle_timeout') {
        return `AI 流长时间无响应，正在重试 ${info.attempt}/${info.maxAttempts}`
    }

    if (info.reason === 'empty_completion' || info.layer === 'empty') {
        return 'AI 返回空响应，正在重试'
    }

    if (info.layer === 'recovery') {
        return `AI 输出中断，正在重新生成 ${info.attempt}/${info.maxAttempts}`
    }

    return `AI 请求失败，正在重试 ${info.attempt}/${info.maxAttempts}`
}

/** 提取错误信息 */
function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error)
}

export class AgentHelper {
    /** 单轮流式请求 */
    static ask(options: IAgentAskOptions): Promise<IAgentResult> {
        return AgentHelper.request(options)
    }

    /** 多轮流式请求 */
    static chat(options: IAgentChatOptions): Promise<IAgentResult> {
        return AgentHelper.request(options)
    }

    /** 发起流式请求 */
    private static async request(
        options: IAgentAskOptions | IAgentChatOptions
    ): Promise<IAgentResult> {
        const {
            config,
            system,
            timeout,
            maxRetries,
            source,
            skipLog,
            signal,
            callback,
            onRetry,
            search
        } = options

        if (signal?.aborted) {
            return { text: '', finishReason: 'error', cancelled: true }
        }

        const re = await TaskHelper.tryExecute(async () => {
            let closed = false
            let isResolved = false
            let text = ''
            let reasoningText = ''

            let resolveTask!: (value: IAgentResult) => void
            let rejectTask!: (reason?: unknown) => void

            const completed = new Promise<IAgentResult>((resolve, reject) => {
                resolveTask = resolve
                rejectTask = reject
            })

            const body = {
                config,
                system,
                timeout,
                maxRetries,
                source,
                skipLog,
                ...(search ? { search } : {}),
                ...('messages' in options
                    ? // 复制一份，避免外部修改
                      { messages: options.messages.map((message) => ({ ...message })) }
                    : { prompt: options.prompt })
            }

            const subscription = ipc.agent.stream.subscribe(body, {
                onData(payload) {
                    if (payload.type === 'retry') {
                        onRetry?.(payload)
                        return
                    }

                    if (payload.type === 'reset') {
                        text = ''
                        reasoningText = ''
                        callback?.('', '', true)
                        return
                    }

                    if (payload.type === 'data') {
                        text += payload.data
                        reasoningText += payload.reasoningData ?? ''
                        callback?.(payload.data, payload.reasoningData ?? '')
                        return
                    }

                    text = payload.text
                    reasoningText = payload.reasoningText ?? reasoningText
                    if (isResolved) return

                    isResolved = true

                    // 异常结束清空半截内容
                    if (!isAgentSuccess(payload.finishReason)) {
                        callback?.('', '', true)
                    }

                    resolveTask({
                        text,
                        ...(reasoningText ? { reasoningText } : {}),
                        finishReason: payload.finishReason
                    })
                },
                onError(error) {
                    if (closed) return

                    closed = true
                    rejectTask(error)
                },
                onComplete() {
                    if (closed) return

                    closed = true
                    if (isResolved) return

                    isResolved = true
                    callback?.('', '', true)
                    resolveTask({
                        text,
                        ...(reasoningText ? { reasoningText } : {}),
                        finishReason: 'error',
                        error: 'AI流未正常结束'
                    })
                }
            })

            // 取消当前请求
            function cancel() {
                if (closed) return

                closed = true
                subscription.unsubscribe()
                callback?.('', '', true)
                rejectTask(new Error('AI流已取消'))
            }

            if (signal?.aborted) {
                cancel()
            } else {
                signal?.addEventListener('abort', cancel, { once: true })
            }

            return {
                completed,
                dispose: () => signal?.removeEventListener('abort', cancel)
            }
        })

        // 统一处理失败返回
        const fail = (error: unknown): IAgentResult => {
            if (signal?.aborted) {
                return { text: '', finishReason: 'error', cancelled: true }
            }

            callback?.('', '', true)
            LogHelper.error(`AI流请求失败：${config.provider}:${config.model}`, error)
            return { text: '', finishReason: 'error', error: getErrorMessage(error) }
        }

        if (re.hasError) return fail(re.error)

        try {
            return await re.result.completed
        } catch (error) {
            return fail(error)
        } finally {
            re.result.dispose()
        }
    }
}
