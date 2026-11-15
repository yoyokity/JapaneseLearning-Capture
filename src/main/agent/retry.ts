import { APICallError, EmptyResponseBodyError } from 'ai'

/**
 * 流式请求默认空闲超时（毫秒）
 */
export const AI_STREAM_IDLE_TIMEOUT_MS = 600_000

/**
 * 每次重试增加的空闲超时（毫秒）
 */
export const AI_STREAM_IDLE_TIMEOUT_STEP_MS = 30_000

/**
 * 单层最大重试次数
 */
export const AI_MAX_RETRIES = 10

/**
 * 退避基础延迟（毫秒）
 */
export const AI_RETRY_BASE_DELAY_MS = 2_000

/**
 * 退避倍率
 */
export const AI_RETRY_BACKOFF_FACTOR = 2

/**
 * 退避上限（毫秒）
 */
export const AI_RETRY_MAX_DELAY_MS = 60_000

/**
 * 可重试的网络错误码
 */
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

/**
 * 可重试的 Electron / Chromium 网络错误
 */
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

/**
 * 获取错误码
 * @param error 错误
 */
function getErrorCode(error: unknown): string | undefined {
    if (!error || typeof error !== 'object') return undefined

    const directCode = (error as { code?: unknown }).code
    if (typeof directCode === 'string') return directCode

    const cause = (error as { cause?: unknown }).cause
    if (cause && typeof cause === 'object') {
        const causeCode = (cause as { code?: unknown }).code
        if (typeof causeCode === 'string') return causeCode
    }

    return undefined
}

/**
 * 获取错误消息
 * @param error 错误
 */
function getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message
    if (error && typeof error === 'object') {
        const message = (error as { message?: unknown }).message
        if (typeof message === 'string') return message
    }
    return ''
}

/**
 * 判断是否命中 Electron / Chromium 网络错误
 * @param error 错误
 */
function hasChromiumNetworkError(error: unknown): boolean {
    const message = getErrorMessage(error)
    if (CHROMIUM_NETWORK_ERRORS.some((item) => message.includes(item))) return true

    const cause = (error as { cause?: unknown } | null)?.cause
    if (!cause || typeof cause !== 'object') return false

    const causeMessage = getErrorMessage(cause)
    return CHROMIUM_NETWORK_ERRORS.some((item) => causeMessage.includes(item))
}

/**
 * 判断错误是否可重试
 * @param error 错误
 */
export function isRetryableError(error: unknown): boolean {
    if (APICallError.isInstance(error)) {
        const statusCode = error.statusCode

        if (statusCode === 408 || statusCode === 429 || statusCode === 529) return true
        if (statusCode != null && statusCode >= 500) return true
        if (statusCode === 400 || statusCode === 401 || statusCode === 403) return false
        if (statusCode === 404 || statusCode === 422) return false

        return error.isRetryable
    }

    if (EmptyResponseBodyError.isInstance(error)) return true

    const errorName = (error as { name?: unknown } | null)?.name
    if (errorName === 'TimeoutError') return true

    if (hasChromiumNetworkError(error)) return true

    const errorCode = getErrorCode(error)
    return errorCode != null && NETWORK_ERROR_CODES.has(errorCode)
}

/**
 * 获取错误的响应头
 * @param error 错误
 */
export function getErrorHeaders(error: unknown): Record<string, string> | undefined {
    return APICallError.isInstance(error) ? error.responseHeaders : undefined
}

/**
 * 读取响应头，忽略大小写
 * @param headers 响应头
 * @param name 头名称
 */
function getHeader(headers: Record<string, string> | undefined, name: string): string | undefined {
    if (!headers) return undefined

    const key = Object.keys(headers).find((item) => item.toLowerCase() === name)
    return key ? headers[key] : undefined
}

/**
 * 获取 Retry-After 时长
 * @param headers 响应头
 * @returns 不超过 5 分钟时返回毫秒数，否则返回 null
 */
function getRetryAfterMs(headers: Record<string, string> | undefined): number | null {
    const shouldRetry = getHeader(headers, 'x-should-retry')
    if (shouldRetry === 'false' || shouldRetry === '0') return null

    const retryAfterMsHeader = getHeader(headers, 'retry-after-ms')
    if (retryAfterMsHeader) {
        const retryAfterMs = Number(retryAfterMsHeader)
        if (Number.isFinite(retryAfterMs) && retryAfterMs >= 0 && retryAfterMs <= 5 * 60 * 1000) {
            return retryAfterMs
        }
    }

    const retryAfterHeader = getHeader(headers, 'retry-after')
    if (retryAfterHeader) {
        const retryAfter = Number(retryAfterHeader)
        if (Number.isFinite(retryAfter) && retryAfter >= 0 && retryAfter <= 5 * 60) {
            return retryAfter * 1000
        }
    }

    return null
}

/**
 * 计算重试等待时长
 * @param attempt 第几次重试，从 1 开始
 * @param headers 响应头
 */
export function getRetryDelayMs(attempt: number, headers?: Record<string, string>): number {
    const retryAfterMs = getRetryAfterMs(headers)
    if (retryAfterMs != null) {
        // 不早于服务商要求的时间，再追加最多 5 秒抖动
        const jitter = Math.random() * Math.min(retryAfterMs * 0.2, 5_000)
        return Math.round(retryAfterMs + jitter)
    }

    const exponential = Math.min(
        AI_RETRY_BASE_DELAY_MS * AI_RETRY_BACKOFF_FACTOR ** (attempt - 1),
        AI_RETRY_MAX_DELAY_MS
    )

    // 50%–100% 抖动，避免一批请求同时醒来
    return Math.round(exponential * (0.5 + Math.random() * 0.5))
}

/**
 * 等待指定时长
 * @param ms 毫秒
 */
export function sleep(ms: number) {
    return new Promise<void>((resolve) => {
        setTimeout(resolve, ms)
    })
}
