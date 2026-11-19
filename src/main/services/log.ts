import log from 'electron-log'
import { z } from 'zod'

/**
 * 日志类型
 */
export type ILogType = 'log' | 'error' | 'warn' | 'success' | 'debug'

/**
 * 日志类型枚举
 */
export const logTypeSchema = z.enum(['log', 'error', 'warn', 'success', 'debug'])

const logMethodMap: Record<ILogType, 'log' | 'error' | 'warn' | 'info' | 'debug'> = {
    log: 'log',
    error: 'error',
    warn: 'warn',
    success: 'info',
    debug: 'debug'
}

/**
 * 写入 log 文件
 */
export function writeLog(type: ILogType, ...params: any[]) {
    try {
        log[logMethodMap[type]](...params)
    } catch (e) {
        console.warn(`log写入失败: [${type}] ${params.join(' ')}`, e)
    }
}
