import type { IAgentToolOptions } from './tools'
import type {
    IAgentCallOptions,
    IAgentChatOptions,
    IAgentResult,
    IAgentRetryPayload,
    IAgentStreamOptions
} from './types'

import { createAgentStream } from './stream'

/** ask 调用选项 */
export interface IAgentAskOptions extends IAgentCallOptions, IAgentToolOptions {
    /** 重试回调 */
    onRetry?: ((payload: IAgentRetryPayload) => void) | undefined
}

/** chat 调用选项 */
export interface IAgentChatRequestOptions extends IAgentChatOptions, IAgentToolOptions {
    /** 取消信号 */
    signal?: AbortSignal | undefined
    /** 重试回调 */
    onRetry?: ((payload: IAgentRetryPayload) => void) | undefined
}

/**
 * 获取错误消息
 * @param error 错误
 */
function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error)
}

/**
 * 发起 AI 请求并等待完整结果
 * @param options 调用选项
 * @remark 流式数据在内部累积，调用方只拿到最终结果
 */
function request(options: IAgentAskOptions | IAgentChatRequestOptions) {
    const {
        config,
        system,
        timeout,
        maxRetries,
        tools,
        maxSteps,
        toolCallConcurrency,
        signal,
        onRetry
    } = options
    const input: IAgentStreamOptions =
        'messages' in options
            ? {
                  config,
                  messages: options.messages,
                  system,
                  timeout,
                  maxRetries,
                  tools,
                  maxSteps,
                  toolCallConcurrency
              }
            : {
                  config,
                  prompt: options.prompt,
                  system,
                  timeout,
                  maxRetries,
                  tools,
                  maxSteps,
                  toolCallConcurrency
              }

    return new Promise<IAgentResult>((resolve) => {
        let text = ''
        let reasoningText = ''
        let settled = false
        let subscription: { unsubscribe: () => void } | null = null

        /**
         * 结束本次调用
         * @param callback 结束回调
         */
        function finish(callback: () => void) {
            if (settled) return

            settled = true
            signal?.removeEventListener('abort', onAbort)
            callback()
        }

        /**
         * 取消本次调用
         */
        function onAbort() {
            subscription?.unsubscribe()
            finish(() => resolve({ text: '', finishReason: 'error', cancelled: true }))
        }

        if (signal?.aborted) {
            resolve({ text: '', finishReason: 'error', cancelled: true })
            return
        }

        subscription = createAgentStream(input).subscribe({
            next(payload) {
                if (payload.type === 'retry') {
                    onRetry?.(payload)
                    return
                }

                if (payload.type === 'reset') {
                    text = ''
                    reasoningText = ''
                    return
                }

                if (payload.type === 'data') {
                    text += payload.data
                    reasoningText += payload.reasoningData ?? ''
                    return
                }

                if (payload.type !== 'end') return

                finish(() => {
                    const finalReasoning = payload.reasoningText ?? reasoningText
                    resolve({
                        text: payload.text || text,
                        ...(finalReasoning ? { reasoningText: finalReasoning } : {}),
                        finishReason: payload.finishReason
                    })
                })
            },
            error(error) {
                finish(() =>
                    resolve({ text: '', finishReason: 'error', error: getErrorMessage(error) })
                )
            },
            complete() {
                finish(() => resolve({ text, finishReason: 'error', error: 'AI流未正常结束' }))
            }
        })

        signal?.addEventListener('abort', onAbort, { once: true })
        if (signal?.aborted) onAbort()
    })
}

/**
 * 单轮流式请求，等待完整结果
 * @param options 调用选项
 */
export function ask(options: IAgentAskOptions) {
    return request(options)
}

/**
 * 多轮流式请求，等待完整结果
 * @param options 调用选项
 */
export function chat(options: IAgentChatRequestOptions) {
    return request(options)
}
