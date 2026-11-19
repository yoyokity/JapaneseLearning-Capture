import type { AgentRetryReason, IAgentStreamOptions, IAgentStreamPayload } from './types'

import { randomUUID } from 'node:crypto'
import { observable } from '@trpc/server/observable'
import { streamText } from 'ai'

import { writeLog } from '../services/log'
import { log } from './log'
import { getAgentModel, getReasoningOption } from './model'
import {
    AI_MAX_RETRIES,
    AI_STREAM_CLEANUP_TIMEOUT_MS,
    AI_STREAM_IDLE_TIMEOUT_INCREMENT_MS,
    AI_STREAM_IDLE_TIMEOUT_MS,
    getErrorHeaders,
    getErrorStatus,
    getRetryDelayMs,
    isContextExceededReason,
    isNonRetryableEmptyReason,
    isRetryableError,
    sleep
} from './retry'
import { getToolOptions, handleToolPart } from './tools'

/** 转为 Error */
function toError(error: unknown) {
    return error instanceof Error ? error : new Error(String(error))
}

/** 获取错误消息 */
function getErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message

    const message = (error as { message?: unknown } | null)?.message
    return typeof message === 'string' ? message : String(error)
}

/** 创建空闲超时错误 */
function createIdleTimeoutError(timeoutMs: number) {
    return Object.assign(new Error(`AI流请求超时：${timeoutMs}ms 内没有收到新数据`), {
        code: 'AI_STREAM_IDLE_TIMEOUT',
        timeoutMs
    })
}

/** 创建流提前结束错误 */
function createEofError() {
    return Object.assign(new Error('AI流提前结束'), { code: 'AI_STREAM_EOF' })
}

/** 创建 AI 流式请求 */
export function createAgentStream(options: IAgentStreamOptions) {
    return observable<IAgentStreamPayload>((emit) => {
        const outerController = new AbortController()
        const baseIdleTimeout = options.timeout ?? AI_STREAM_IDLE_TIMEOUT_MS
        const maxRetries = options.maxRetries ?? AI_MAX_RETRIES
        const toolOptions = getToolOptions(options)
        const aiLog = options.skipLog ? null : log
        let stopped = false
        let attemptController: AbortController | null = null
        let timeoutId: ReturnType<typeof setTimeout> | null = null
        let timedOut = false
        let attemptId = ''
        let attemptText = ''
        let attemptReasoning = ''

        const sessionId = options.sessionId ?? randomUUID()
        aiLog?.startSession({
            id: sessionId,
            source: options.source,
            provider: options.config.provider,
            model: options.config.model,
            apiFormat: options.config.apiFormat,
            reasoningEffort: options.config.reasoningEffort,
            input:
                'messages' in options ? { messages: options.messages } : { prompt: options.prompt },
            system: options.system
        })

        /** 清理空闲计时器 */
        function clearTimer() {
            if (!timeoutId) return

            clearTimeout(timeoutId)
            timeoutId = null
        }

        /** 重新开始空闲计时 */
        function startTimer(idleTimeout: number) {
            clearTimer()
            timeoutId = setTimeout(() => {
                timedOut = true
                attemptController?.abort()
            }, idleTimeout)
        }

        void (async () => {
            let retryCount = 0
            let emptyRetried = false

            /** 记录失败结果 */
            function finishWithError(
                error: unknown,
                extra?: {
                    reason?: AgentRetryReason | undefined
                    timeoutMs?: number | undefined
                    finishReason?: string | undefined
                }
            ) {
                const message = getErrorMessage(error)

                aiLog?.finishAttempt(attemptId, {
                    status: 'error',
                    retryReason: extra?.reason,
                    statusCode: getErrorStatus(error),
                    timeoutMs: extra?.timeoutMs,
                    error: message,
                    text: attemptText,
                    reasoningText: attemptReasoning
                })
                aiLog?.finishSession(sessionId, {
                    status: 'error',
                    finishReason: extra?.finishReason,
                    error: message,
                    text: attemptText,
                    reasoningText: attemptReasoning
                })
            }

            /** 等待并准备重试 */
            async function waitForRetry(
                reason: AgentRetryReason,
                error: unknown,
                extra?: { timeoutMs?: number }
            ) {
                if (stopped || outerController.signal.aborted) return false
                if (retryCount >= maxRetries) return false

                retryCount++
                const delayMs = getRetryDelayMs(retryCount, getErrorHeaders(error))
                const statusCode = getErrorStatus(error)
                aiLog?.finishAttempt(attemptId, {
                    status: 'retried',
                    retryReason: reason,
                    statusCode,
                    timeoutMs: extra?.timeoutMs,
                    delayMs,
                    text: attemptText,
                    reasoningText: attemptReasoning
                })
                emit.next({
                    type: 'retry',
                    layer: reason === 'empty_completion' ? 'empty' : 'adapter',
                    attempt: retryCount,
                    maxAttempts: maxRetries,
                    delayMs,
                    reason,
                    ...(statusCode !== undefined ? { statusCode } : {}),
                    ...(extra?.timeoutMs !== undefined ? { timeoutMs: extra.timeoutMs } : {})
                })
                writeLog('warn', '[AI] 重试', {
                    attempt: retryCount,
                    maxAttempts: maxRetries,
                    reason,
                    delayMs,
                    statusCode,
                    timeoutMs: extra?.timeoutMs
                })

                try {
                    await sleep(delayMs, outerController.signal)
                } catch {
                    return false
                }

                return true
            }

            while (!stopped) {
                const idleTimeout =
                    baseIdleTimeout + retryCount * AI_STREAM_IDLE_TIMEOUT_INCREMENT_MS
                attemptId = aiLog ? aiLog.startAttempt(sessionId, retryCount + 1) : ''
                attemptText = ''
                attemptReasoning = ''
                attemptController = new AbortController()
                const signal = AbortSignal.any([outerController.signal, attemptController.signal])
                const abortPromise = new Promise<never>((_, reject) => {
                    const onAbort = () => reject(signal.reason ?? new Error('已取消'))
                    if (signal.aborted) {
                        onAbort()
                        return
                    }
                    signal.addEventListener('abort', onAbort, { once: true })
                })
                timedOut = false
                startTimer(idleTimeout)

                let errorPart: unknown
                const toolState = { callCount: 0 }
                let hasCommittedOutput = false
                let sawFinish = false
                let streamDone = false

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
                        onStepEnd: (step) => aiLog?.saveStep(attemptId, step),
                        ...(options.system ? { system: options.system } : {}),
                        ...toolOptions,
                        ...getReasoningOption(options.config)
                    })
                    const iterator = result.stream[Symbol.asyncIterator]()

                    try {
                        while (true) {
                            const next = await Promise.race([iterator.next(), abortPromise])
                            if (next.done) {
                                streamDone = true
                                break
                            }

                            const part = next.value
                            if (stopped) return

                            // error 事件视为失败
                            if (part.type === 'error') {
                                errorPart = part.error
                                break
                            }

                            // 工具事件跨过重试边界
                            if (handleToolPart(part, toolState)) {
                                clearTimer()
                                hasCommittedOutput = true
                                continue
                            }

                            if (part.type === 'finish-step') {
                                clearTimer()
                                continue
                            }

                            if (part.type === 'finish') {
                                sawFinish = true
                                clearTimer()
                                continue
                            }

                            startTimer(idleTimeout)

                            if (part.type !== 'text-delta' && part.type !== 'reasoning-delta')
                                continue
                            if (!part.text) continue

                            hasCommittedOutput = true

                            if (part.type === 'text-delta') {
                                attemptText += part.text
                                emit.next({ type: 'data', data: part.text })
                            } else {
                                attemptReasoning += part.text
                                emit.next({ type: 'data', data: '', reasoningData: part.text })
                            }
                        }
                    } finally {
                        // 有界等待旧流关闭
                        if (!streamDone) {
                            try {
                                await Promise.race([
                                    Promise.resolve(iterator.return?.()),
                                    sleep(AI_STREAM_CLEANUP_TIMEOUT_MS)
                                ])
                            } catch {
                                // 关闭异常忽略
                            }
                        }
                    }

                    if (errorPart) throw errorPart
                    if (!sawFinish) throw createEofError()

                    const step = await result.finalStep
                    const finishReason = step.finishReason
                    const rawFinishReason = step.rawFinishReason
                    const reasoningText = step.reasoningText ?? attemptReasoning
                    const usage = step.usage
                    const hasUsage = (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0) > 0
                    const hasOutput =
                        attemptText.length > 0 ||
                        attemptReasoning.length > 0 ||
                        toolState.callCount > 0 ||
                        hasUsage

                    // 上下文超限直接失败
                    if (!hasOutput && isContextExceededReason(finishReason, rawFinishReason)) {
                        const error = Object.assign(
                            new Error('AI 上下文超限，请缩短字幕或更换模型'),
                            { code: 'AI_CONTEXT_EXCEEDED' }
                        )
                        writeLog('error', '[AI] 上下文超限', {
                            attempt: retryCount + 1
                        })
                        finishWithError(error)
                        emit.error(error)
                        stopped = true
                        return
                    }

                    // 拒绝或过滤直接失败
                    if (!hasOutput && isNonRetryableEmptyReason(finishReason, rawFinishReason)) {
                        const error = Object.assign(new Error('AI 拒绝生成或内容被过滤'), {
                            code: 'AI_CONTENT_FILTERED'
                        })
                        writeLog('error', '[AI] 内容被拒绝', {
                            attempt: retryCount + 1
                        })
                        finishWithError(error)
                        emit.error(error)
                        stopped = true
                        return
                    }

                    // 空响应最多重试一次
                    if (!hasOutput) {
                        if (!emptyRetried) {
                            emptyRetried = true
                            if (
                                await waitForRetry('empty_completion', new Error('AI 返回空响应'))
                            ) {
                                continue
                            }
                        }

                        writeLog('error', '[AI] 空响应', {
                            attempt: retryCount + 1
                        })
                        const error = new Error('AI 返回空响应')
                        finishWithError(error)
                        emit.error(error)
                        stopped = true
                        return
                    }

                    // 中断或错误处理
                    if (finishReason === 'interrupted' || finishReason === 'error') {
                        const error = new Error(`AI生成未完成：${finishReason}`)
                        const retryable = finishReason === 'interrupted' || isRetryableError(error)

                        if (!hasCommittedOutput && retryable) {
                            if (await waitForRetry('request_failed', error)) continue
                        }

                        if (hasCommittedOutput) emit.next({ type: 'reset' })
                        if (!stopped && !outerController.signal.aborted) {
                            finishWithError(error, { finishReason })
                            writeLog('error', '[AI] 请求失败', {
                                attempt: retryCount + 1,
                                message: getErrorMessage(error),
                                statusCode: getErrorStatus(error)
                            })
                            emit.error(toError(error))
                            stopped = true
                        }
                        return
                    }

                    let totalUsage: unknown = step.usage
                    let responseMessages: unknown
                    try {
                        responseMessages = await result.responseMessages
                        totalUsage = await result.usage
                    } catch {
                        // 元数据读取失败忽略
                    }

                    aiLog?.finishAttempt(attemptId, {
                        status: 'success',
                        text: attemptText,
                        reasoningText,
                        usage: totalUsage
                    })
                    aiLog?.finishSession(sessionId, {
                        status: 'success',
                        finishReason,
                        text: attemptText,
                        reasoningText,
                        usage: totalUsage,
                        responseMessages
                    })

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
                    clearTimer()
                    if (stopped || outerController.signal.aborted) return

                    const effectiveError = timedOut ? createIdleTimeoutError(idleTimeout) : error
                    const errorCode = (error as { code?: unknown } | null)?.code
                    const retryable =
                        timedOut || isRetryableError(error) || errorCode === 'AI_STREAM_EOF'

                    if (hasCommittedOutput) {
                        // 已越过重试边界
                        emit.next({ type: 'reset' })
                    } else {
                        if (retryable) {
                            const retried = await waitForRetry(
                                timedOut ? 'stream_idle_timeout' : 'request_failed',
                                effectiveError,
                                timedOut ? { timeoutMs: idleTimeout } : undefined
                            )
                            if (retried) continue
                        }
                        if (stopped || outerController.signal.aborted) return
                    }

                    finishWithError(effectiveError, {
                        reason: timedOut ? 'stream_idle_timeout' : 'request_failed',
                        timeoutMs: timedOut ? idleTimeout : undefined
                    })
                    writeLog('error', '[AI] 请求失败', {
                        attempt: retryCount + 1,
                        reason: timedOut ? 'stream_idle_timeout' : 'request_failed',
                        message: getErrorMessage(error),
                        statusCode: getErrorStatus(error),
                        timeoutMs: timedOut ? idleTimeout : undefined
                    })
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
                if (attemptId) {
                    aiLog?.finishAttempt(attemptId, {
                        status: 'cancelled',
                        text: attemptText,
                        reasoningText: attemptReasoning
                    })
                }
                aiLog?.finishSession(sessionId, {
                    status: 'cancelled',
                    text: attemptText,
                    reasoningText: attemptReasoning
                })
            }
        }
    })
}
