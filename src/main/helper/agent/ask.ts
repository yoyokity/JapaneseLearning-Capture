import type { IAgentToolOptions } from './tools'
import type { IAgentChatOptions, IAgentResult, IAgentRetryPayload } from './types'

import { createAgentStream } from './stream'

export interface IAgentChatRequestOptions extends IAgentChatOptions, IAgentToolOptions {
    /** 取消信号 */
    signal?: AbortSignal | undefined
    /** 重试回调 */
    onRetry?: ((payload: IAgentRetryPayload) => void) | undefined
}

/** 多轮流式请求，等待完整结果 */
export function chat(options: IAgentChatRequestOptions) {
    const { signal, onRetry, ...input } = options

    return new Promise<IAgentResult>((resolve) => {
        let text = ''
        let reasoningText = ''
        let settled = false
        let subscription: { unsubscribe: () => void } | null = null

        /** 结束本次调用 */
        function finish(callback: () => void) {
            if (settled) return

            settled = true
            signal?.removeEventListener('abort', onAbort)
            callback()
        }

        /** 取消本次调用 */
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
                    resolve({
                        text: '',
                        finishReason: 'error',
                        error: error instanceof Error ? error.message : String(error)
                    })
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
