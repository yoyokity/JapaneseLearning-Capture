import { APICallError, EmptyResponseBodyError } from 'ai'

/** 空闲超时（毫秒） */
export const AI_STREAM_IDLE_TIMEOUT_MS = 600_000

/** 超时增量（毫秒） */
export const AI_STREAM_IDLE_TIMEOUT_INCREMENT_MS = 30_000

/** 最大重试次数 */
export const AI_MAX_RETRIES = 10

/** 流关闭等待（毫秒） */
export const AI_STREAM_CLEANUP_TIMEOUT_MS = 5_000

/** 退避基础延迟（毫秒） */
export const AI_RETRY_BASE_DELAY_MS = 2_000

/** 退避倍率 */
export const AI_RETRY_BACKOFF_FACTOR = 2

/** 退避上限（毫秒） */
export const AI_RETRY_MAX_DELAY_MS = 60_000

/** 可重试的网络错误码 */
const NETWORK_ERROR_CODES = new Set([
    'ECONNRESET',
    'ECONNREFUSED',
    'EAI_AGAIN',
    'ENOTFOUND',
    'ENETUNREACH',
    'EHOSTUNREACH',
    'ETIMEDOUT',
    'UND_ERR_SOCKET',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_HEADERS_TIMEOUT',
    'UND_ERR_BODY_TIMEOUT'
])

/** Electron 网络错误 */
const CHROMIUM_NETWORK_ERRORS = [
    'net::ERR_CONNECTION_REFUSED',
    'net::ERR_CONNECTION_RESET',
    'net::ERR_NAME_NOT_RESOLVED',
    'net::ERR_NAME_RESOLUTION_FAILED',
    'net::ERR_NETWORK_CHANGED',
    'net::ERR_INTERNET_DISCONNECTED',
    'net::ERR_TIMED_OUT',
    'net::ERR_CONNECTION_TIMED_OUT',
    'net::ERR_EMPTY_RESPONSE',
    'net::ERR_SOCKET_NOT_CONNECTED'
]

/** 获取错误码 */
function getErrorCode(error: unknown): string | undefined {
    if (!error || typeof error !== 'object') return undefined

    const { code, cause } = error as { code?: unknown; cause?: unknown }
    if (typeof code === 'string') return code

    const causeCode = (cause as { code?: unknown } | null)?.code
    return typeof causeCode === 'string' ? causeCode : undefined
}

/** 获取错误消息 */
function getErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message

    const message = (error as { message?: unknown } | null)?.message
    return typeof message === 'string' ? message : ''
}

/** 上下文超限标记 */
const CONTEXT_EXCEEDED_MARKERS = new Set([
    'context_exceeded',
    'context_length_exceeded',
    'context_window_exceeded',
    'model_context_exceeded',
    'model_context_window_exceeded',
    'prompt_too_long'
])

/** 空响应不可重试标记 */
const NON_RETRYABLE_EMPTY_MARKERS = new Set([
    'refusal',
    'content_filter',
    'content-filter',
    'content-filtered'
])

/** 是否上下文超限 */
export function isContextExceededReason(
    finishReason: string | undefined,
    rawFinishReason: string | undefined
) {
    return [finishReason, rawFinishReason].some((reason) => {
        if (!reason) return false

        return CONTEXT_EXCEEDED_MARKERS.has(reason.trim().toLowerCase())
    })
}

/** 空响应是否不可重试 */
export function isNonRetryableEmptyReason(
    finishReason: string | undefined,
    rawFinishReason: string | undefined
) {
    if (isContextExceededReason(finishReason, rawFinishReason)) return true
    if (finishReason === 'content-filter') return true

    return [finishReason, rawFinishReason].some((reason) => {
        if (!reason) return false

        return NON_RETRYABLE_EMPTY_MARKERS.has(reason.trim().toLowerCase())
    })
}

/** 获取错误状态码 */
export function getErrorStatus(error: unknown) {
    return APICallError.isInstance(error) ? error.statusCode : undefined
}

/** 是否 Chromium 网络错误 */
function hasChromiumNetworkError(error: unknown) {
    const messages = [
        getErrorMessage(error),
        getErrorMessage((error as { cause?: unknown } | null)?.cause)
    ]

    return messages.some((message) =>
        CHROMIUM_NETWORK_ERRORS.some((item) => message.includes(item))
    )
}

/** 服务商是否拒绝重试 */
function isRetryRefused(headers: Record<string, string> | undefined) {
    const value = getHeader(headers, 'x-should-retry')?.trim().toLowerCase()
    return value === 'false' || value === '0'
}

/** 是否可重试 */
export function isRetryableError(error: unknown): boolean {
    if (APICallError.isInstance(error)) {
        if (isRetryRefused(error.responseHeaders)) return false

        const statusCode = error.statusCode

        if (statusCode === 408 || statusCode === 429 || statusCode === 529) return true
        if (statusCode != null && statusCode >= 500) return true
        if (statusCode === 400 || statusCode === 401 || statusCode === 403) return false
        if (statusCode === 404 || statusCode === 422) return false

        return error.isRetryable
    }

    if (EmptyResponseBodyError.isInstance(error)) return true
    if ((error as { name?: unknown } | null)?.name === 'TimeoutError') return true
    if (hasChromiumNetworkError(error)) return true

    const errorCode = getErrorCode(error)
    return errorCode != null && NETWORK_ERROR_CODES.has(errorCode)
}

/** 获取错误响应头 */
export function getErrorHeaders(error: unknown): Record<string, string> | undefined {
    return APICallError.isInstance(error) ? error.responseHeaders : undefined
}

/** 读取响应头 */
function getHeader(headers: Record<string, string> | undefined, name: string) {
    const key = Object.keys(headers ?? {}).find((item) => item.toLowerCase() === name)
    return key ? headers?.[key] : undefined
}

/** 获取 Retry-After 时长 */
function getRetryAfterMs(headers: Record<string, string> | undefined): number | null {
    if (isRetryRefused(headers)) return null

    const retryAfterMsHeader = getHeader(headers, 'retry-after-ms')
    const retryAfterMs = Number(retryAfterMsHeader)
    if (
        retryAfterMsHeader &&
        Number.isFinite(retryAfterMs) &&
        retryAfterMs >= 0 &&
        retryAfterMs <= 5 * 60 * 1000
    ) {
        return retryAfterMs
    }

    const retryAfterHeader = getHeader(headers, 'retry-after')
    const retryAfter = Number(retryAfterHeader)
    if (
        retryAfterHeader &&
        Number.isFinite(retryAfter) &&
        retryAfter >= 0 &&
        retryAfter <= 5 * 60
    ) {
        return retryAfter * 1000
    }

    // 兼容 HTTP-date 格式
    const retryAfterDate = Date.parse(retryAfterHeader ?? '')
    if (Number.isFinite(retryAfterDate)) {
        const delayMs = retryAfterDate - Date.now()
        if (delayMs >= 0 && delayMs <= 5 * 60 * 1000) return delayMs
    }

    return null
}

/** 计算重试等待时长 */
export function getRetryDelayMs(attempt: number, headers?: Record<string, string>): number {
    const retryAfterMs = getRetryAfterMs(headers)
    if (retryAfterMs != null) {
        // 追加最多 5 秒抖动
        return Math.round(retryAfterMs + Math.random() * Math.min(retryAfterMs * 0.2, 5_000))
    }

    const exponential = Math.min(
        AI_RETRY_BASE_DELAY_MS * AI_RETRY_BACKOFF_FACTOR ** (attempt - 1),
        AI_RETRY_MAX_DELAY_MS
    )

    // 50%–100% 抖动
    return Math.round(exponential * (0.5 + Math.random() * 0.5))
}

/** 等待指定时长 */
export function sleep(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
            reject(new Error('已取消'))
            return
        }

        const timeoutId = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort)
            resolve()
        }, ms)

        /** 取消等待 */
        function onAbort() {
            clearTimeout(timeoutId)
            reject(new Error('已取消'))
        }

        signal?.addEventListener('abort', onAbort, { once: true })
    })
}
