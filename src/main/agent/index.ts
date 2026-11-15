import type { IAgentStreamOptions, IAgentStreamPayload } from './types'

import { observable } from '@trpc/server/observable'
import { streamText } from 'ai'

import { getAgentModel, getReasoningOption } from './model'
import {
    AI_MAX_RETRIES,
    AI_STREAM_IDLE_TIMEOUT_MS,
    getErrorHeaders,
    getRetryDelayMs,
    isRetryableError,
    sleep
} from './retry'
import { isAgentSuccess } from './types'

export * from './schema'
export * from './types'

/**
 * 转为 Error
 * @param error 错误
 */
function toError(error: unknown) {
    return error instanceof Error ? error : new Error(String(error))
}

/**
 * 创建 AI 流式请求
 * @param options 调用参数
 */
export function createAgentStream(options: IAgentStreamOptions) {
    return observable<IAgentStreamPayload>((emit) => {
        const outerController = new AbortController()
        const baseIdleTimeout = options.timeout ?? AI_STREAM_IDLE_TIMEOUT_MS
        let stopped = false
        let attemptController: AbortController | null = null
        let timeoutId: ReturnType<typeof setTimeout> | null = null
        let timedOut = false

        /**
         * 清理空闲计时器
         */
        function clearTimer() {
            if (!timeoutId) return

            clearTimeout(timeoutId)
            timeoutId = null
        }

        /**
         * 重新开始空闲计时
         * @param idleTimeout 空闲超时（毫秒）
         */
        function startTimer(idleTimeout: number) {
            clearTimer()
            timeoutId = setTimeout(() => {
                timedOut = true
                attemptController?.abort()
            }, idleTimeout)
        }

        void (async () => {
            let adapterRetries = 0
            let recoveryRetries = 0
            let totalRetries = 0
            let emptyRetried = false
            let hasCommittedOutput = false
            let hasEverOutput = false

            /**
             * 等待并准备下一次尝试
             * @param layer 重试层
             * @param error 触发错误
             */
            async function waitForRetry(layer: 'adapter' | 'recovery', error: unknown) {
                if (stopped || outerController.signal.aborted) return false

                if (layer === 'adapter') {
                    if (adapterRetries >= AI_MAX_RETRIES) return false
                    adapterRetries++
                } else {
                    if (recoveryRetries >= AI_MAX_RETRIES) return false
                    recoveryRetries++
                }

                // 已输出内容时先清空
                if (layer === 'recovery' && hasCommittedOutput) {
                    hasCommittedOutput = false
                    emit.next({ type: 'reset' })
                }

                totalRetries++
                const delayMs = getRetryDelayMs(totalRetries, getErrorHeaders(error))
                emit.next({
                    type: 'retry',
                    layer,
                    attempt: layer === 'adapter' ? adapterRetries : recoveryRetries,
                    maxAttempts: AI_MAX_RETRIES,
                    delayMs
                })

                try {
                    await sleep(delayMs, outerController.signal)
                } catch {
                    return false
                }

                return true
            }

            while (!stopped) {
                attemptController = new AbortController()
                const signal = AbortSignal.any([outerController.signal, attemptController.signal])
                timedOut = false
                startTimer(baseIdleTimeout)

                let attemptText = ''
                let attemptReasoning = ''
                let errorPart: unknown

                try {
                    const input =
                        'messages' in options
                            ? { messages: options.messages }
                            : { prompt: options.prompt }
                    const result = streamText({
                        model: getAgentModel(options.config),
                        ...input,
                        abortSignal: signal,
                        maxRetries: 0,
                        ...(options.system ? { system: options.system } : {}),
                        ...getReasoningOption(options.config)
                    })

                    for await (const part of result.stream) {
                        if (stopped) return
                        startTimer(baseIdleTimeout)

                        if (part.type === 'error') {
                            errorPart = part.error
                            continue
                        }

                        if (part.type === 'finish') {
                            hasCommittedOutput = true
                            hasEverOutput = true
                            continue
                        }

                        if (part.type !== 'text-delta' && part.type !== 'reasoning-delta') continue
                        if (!part.text) continue

                        hasCommittedOutput = true
                        hasEverOutput = true

                        if (part.type === 'text-delta') {
                            attemptText += part.text
                            emit.next({ type: 'data', data: part.text })
                        } else {
                            attemptReasoning += part.text
                            emit.next({ type: 'data', data: '', reasoningData: part.text })
                        }
                    }

                    const step = await result.finalStep
                    const stepFinishReason = step.finishReason
                    // 未正常结束时视为致命
                    const finishReason =
                        errorPart && !isAgentSuccess(stepFinishReason) ? 'error' : stepFinishReason
                    const reasoningText = step.reasoningText ?? attemptReasoning

                    // 空响应额外重试一次
                    if (
                        isAgentSuccess(finishReason) &&
                        !attemptText.trim() &&
                        !reasoningText.trim()
                    ) {
                        if (!emptyRetried) {
                            emptyRetried = true
                            totalRetries++
                            const delayMs = getRetryDelayMs(totalRetries)
                            emit.next({
                                type: 'retry',
                                layer: 'empty',
                                attempt: 1,
                                maxAttempts: 1,
                                delayMs
                            })
                            await sleep(delayMs, outerController.signal)
                            continue
                        }

                        emit.error(new Error('AI 返回空响应'))
                        stopped = true
                        return
                    }

                    // 中断或错误时按输出情况重试
                    if (finishReason === 'interrupted' || finishReason === 'error') {
                        const error = errorPart ?? new Error(`AI生成未完成：${finishReason}`)
                        const retryable = finishReason === 'interrupted' || isRetryableError(error)

                        if (retryable) {
                            const layer = hasEverOutput ? 'recovery' : 'adapter'
                            if (await waitForRetry(layer, error)) continue
                            if (stopped || outerController.signal.aborted) return
                        }

                        emit.error(toError(error))
                        stopped = true
                        return
                    }

                    emit.next({
                        type: 'end',
                        text: attemptText,
                        ...(reasoningText ? { reasoningText } : {}),
                        finishReason
                    })
                    stopped = true
                    emit.complete()
                    return
                } catch (error) {
                    if (stopped || outerController.signal.aborted) return

                    const effectiveError = timedOut
                        ? new Error('AI流请求超时：连续一段时间未收到新的数据块')
                        : error

                    // 非重试错误直接结束
                    if (!timedOut && !isRetryableError(error)) {
                        emit.error(toError(error))
                        stopped = true
                        return
                    }

                    const layer = hasEverOutput ? 'recovery' : 'adapter'
                    if (await waitForRetry(layer, effectiveError)) continue
                    if (stopped || outerController.signal.aborted) return

                    emit.error(toError(effectiveError))
                    stopped = true
                    return
                } finally {
                    clearTimer()
                }
            }
        })()

        return {
            unsubscribe() {
                stopped = true
                clearTimer()
                outerController.abort()
            }
        }
    })
}
