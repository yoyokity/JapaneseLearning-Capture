import type {
    IAgentCallOptions,
    IAgentDataPayload,
    IAgentEndPayload,
    IAgentResult,
    IAgentRetryPayload,
    IAgentStreamOptions,
    IAgentStreamPayload
} from './types'

import { observable } from '@trpc/server/observable'
import { generateText, streamText } from 'ai'

import { getAgentModel, getReasoningOption } from './model'
import {
    AI_MAX_RETRIES,
    AI_STREAM_IDLE_TIMEOUT_MS,
    AI_STREAM_IDLE_TIMEOUT_STEP_MS,
    getErrorHeaders,
    getRetryDelayMs,
    isRetryableError,
    sleep
} from './retry'
import { isAgentSuccess } from './types'

export * from './schema'
export * from './types'

/**
 * 非流式 AI 调用
 * @param options 调用参数
 */
export async function generateAgentText(options: IAgentCallOptions): Promise<IAgentResult> {
    let retries = 0
    let emptyRetried = false

    while (true) {
        let signal = options.signal
        if (options.timeout) {
            const timeoutSignal = AbortSignal.timeout(options.timeout)
            signal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
        }

        try {
            const result = await generateText({
                model: getAgentModel(options.config),
                prompt: options.prompt,
                ...(signal ? { abortSignal: signal } : {}),
                maxRetries: 0,
                ...(options.system ? { system: options.system } : {}),
                ...getReasoningOption(options.config)
            })

            const step = result.finalStep
            const text = result.text
            const reasoningText = step.reasoningText

            // 空响应额外重试一次
            if (isAgentSuccess(step.finishReason) && !text.trim() && !reasoningText?.trim()) {
                if (!emptyRetried) {
                    emptyRetried = true
                    retries++
                    await sleep(getRetryDelayMs(retries))
                    continue
                }

                throw new Error('AI 返回空响应')
            }

            return {
                text,
                ...(reasoningText ? { reasoningText } : {}),
                finishReason: step.finishReason
            }
        } catch (error) {
            if (options.signal?.aborted) throw error
            if (!isRetryableError(error) || retries >= AI_MAX_RETRIES) throw error

            retries++
            await sleep(getRetryDelayMs(retries, getErrorHeaders(error)))
        }
    }
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
            if (timeoutId) {
                clearTimeout(timeoutId)
                timeoutId = null
            }
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
             * @param error 触发重试的错误
             */
            async function waitForRetry(layer: 'adapter' | 'recovery', error: unknown) {
                if (layer === 'adapter') {
                    if (adapterRetries >= AI_MAX_RETRIES) return false
                    adapterRetries++
                } else {
                    if (recoveryRetries >= AI_MAX_RETRIES) return false
                    recoveryRetries++
                }

                // 已展示过内容时先通知上层清空，再从安全锚点重新生成
                if (layer === 'recovery' && hasCommittedOutput) {
                    hasCommittedOutput = false
                    emit.next({ type: 'reset' })
                }

                totalRetries++
                const delayMs = getRetryDelayMs(totalRetries, getErrorHeaders(error))
                const retryPayload: IAgentRetryPayload = {
                    type: 'retry',
                    layer,
                    attempt: layer === 'adapter' ? adapterRetries : recoveryRetries,
                    maxAttempts: AI_MAX_RETRIES,
                    delayMs
                }
                emit.next(retryPayload)
                await sleep(delayMs)
                return true
            }

            while (!stopped) {
                attemptController = new AbortController()
                const signal = AbortSignal.any([outerController.signal, attemptController.signal])
                const idleTimeout = baseIdleTimeout + totalRetries * AI_STREAM_IDLE_TIMEOUT_STEP_MS
                timedOut = false
                startTimer(idleTimeout)

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
                        startTimer(idleTimeout)

                        if (part.type === 'error') {
                            errorPart = part.error
                            continue
                        }

                        if (part.type === 'finish') {
                            hasCommittedOutput = true
                            hasEverOutput = true
                            continue
                        }

                        if (part.type === 'text-delta') {
                            if (!part.text) continue

                            hasCommittedOutput = true
                            hasEverOutput = true
                            attemptText += part.text

                            const dataPayload: IAgentDataPayload = {
                                type: 'data',
                                data: part.text
                            }
                            emit.next(dataPayload)
                            continue
                        }

                        if (part.type === 'reasoning-delta') {
                            if (!part.text) continue

                            hasCommittedOutput = true
                            hasEverOutput = true
                            attemptReasoning += part.text

                            const dataPayload: IAgentDataPayload = {
                                type: 'data',
                                data: '',
                                reasoningData: part.text
                            }
                            emit.next(dataPayload)
                        }
                    }

                    const step = await result.finalStep
                    const finishReason = errorPart ? 'error' : step.finishReason
                    const reasoningText = step.reasoningText ?? attemptReasoning

                    // 空响应额外重试一次，不计入 adapter / recovery 预算
                    if (
                        isAgentSuccess(finishReason) &&
                        !attemptText.trim() &&
                        !reasoningText.trim()
                    ) {
                        if (!emptyRetried) {
                            emptyRetried = true
                            totalRetries++
                            const delayMs = getRetryDelayMs(totalRetries)
                            const retryPayload: IAgentRetryPayload = {
                                type: 'retry',
                                layer: 'empty',
                                attempt: 1,
                                maxAttempts: 1,
                                delayMs
                            }
                            emit.next(retryPayload)
                            await sleep(delayMs)
                            continue
                        }

                        emit.error(new Error('AI 返回空响应'))
                        stopped = true
                        return
                    }

                    // 中断或错误：按是否已输出过内容选择重试层
                    if (finishReason === 'interrupted' || finishReason === 'error') {
                        const error = errorPart ?? new Error(`AI生成未完成：${finishReason}`)
                        const retryable = finishReason === 'interrupted' || isRetryableError(error)

                        if (retryable) {
                            const layer = hasEverOutput ? 'recovery' : 'adapter'
                            if (await waitForRetry(layer, error)) continue
                        }

                        emit.error(error instanceof Error ? error : new Error(String(error)))
                        stopped = true
                        return
                    }

                    const endPayload: IAgentEndPayload = {
                        type: 'end',
                        text: attemptText,
                        ...(reasoningText ? { reasoningText } : {}),
                        finishReason
                    }
                    emit.next(endPayload)
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
                        emit.error(error instanceof Error ? error : new Error(String(error)))
                        stopped = true
                        return
                    }

                    const layer = hasEverOutput ? 'recovery' : 'adapter'
                    if (await waitForRetry(layer, effectiveError)) continue

                    emit.error(
                        effectiveError instanceof Error
                            ? effectiveError
                            : new Error(String(effectiveError))
                    )
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
