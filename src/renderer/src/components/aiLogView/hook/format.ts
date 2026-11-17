import type { IAiLogSessionRecord } from '@shared'

import dayjs from 'dayjs'

/** 去除小数末尾 0 */
const TRAILING_ZERO = /\.?0+$/

/** 格式化时间 */
export function formatTime(timestamp: number | null) {
    return timestamp ? dayjs(timestamp).format('YYYY-MM-DD HH:mm:ss') : '-'
}

/** 格式化来源 */
export function formatSource(source: string | null) {
    if (!source) return 'AI'
    if (source === 'subtitle') return '字幕优化和翻译'
    if (source === 'translate') return '翻译'
    return source
}

/** 格式化状态 */
export function formatStatus(status: string | null) {
    switch (status) {
        case 'success':
            return '成功'
        case 'error':
            return '失败'
        case 'cancelled':
            return '取消'
        case 'running':
            return '进行中'
        case 'retried':
            return '已重试'
        default:
            return status ?? '无'
    }
}

/** 获取状态标签颜色 */
export function getStatusSeverity(status: string | null) {
    switch (status) {
        case 'success':
            return 'success'
        case 'error':
            return 'danger'
        case 'cancelled':
        case 'retried':
            return 'warn'
        case 'running':
            return 'info'
        default:
            return 'secondary'
    }
}

/** 格式化紧凑数字 */
function formatCompactNumber(value: number) {
    if (value >= 1_000_000) {
        return `${(value / 1_000_000).toFixed(2).replace(TRAILING_ZERO, '')}M`
    }
    if (value >= 1_000) {
        return `${(value / 1_000).toFixed(1).replace(TRAILING_ZERO, '')}K`
    }
    return String(value)
}

/** 格式化用量 */
export function formatUsage(usage: unknown) {
    if (!usage || typeof usage !== 'object') return ''

    const item = usage as {
        inputTokens?: number
        outputTokens?: number
        inputTokenDetails?: { cacheReadTokens?: number }
    }
    const input = item.inputTokens ?? 0
    const output = item.outputTokens ?? 0
    if (!input && !output) return ''

    const parts = [`输入 ${formatCompactNumber(input)}`, `输出 ${formatCompactNumber(output)}`]
    const cacheRead = item.inputTokenDetails?.cacheReadTokens ?? 0
    if (input > 0 && cacheRead > 0) {
        parts.push(`缓存 ${Math.round((cacheRead / input) * 100)}%`)
    }

    return parts.join(' · ')
}

/** 格式化工作区标题 */
export function getWorkLabel(session: IAiLogSessionRecord) {
    if (session.status === 'cancelled') return '已停止'
    if (!session.finishedAt) return '进行中'

    const totalSeconds = Math.max(1, Math.round((session.finishedAt - session.startedAt) / 1000))
    const days = Math.floor(totalSeconds / 86_400)
    const hours = Math.floor((totalSeconds % 86_400) / 3_600)
    const minutes = Math.floor((totalSeconds % 3_600) / 60)
    const seconds = totalSeconds % 60
    const parts: string[] = []
    if (days > 0) parts.push(`${days} 天`)
    if (hours > 0) parts.push(`${hours} 小时`)
    if (minutes > 0) parts.push(`${minutes} 分`)
    if (seconds > 0 || !parts.length) parts.push(`${seconds} 秒`)

    return `已工作 ${parts.slice(0, 2).join(' ')}`
}
