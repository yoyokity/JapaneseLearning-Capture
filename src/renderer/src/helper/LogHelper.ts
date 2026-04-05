import type { ConsolaReporter, LogType } from 'consola'

import { Ipc } from '@renderer/ipc'
import { consola, LogLevels } from 'consola'

export interface IDebugTitleItem {
    /**
     * 标题文本
     */
    text: string
    /**
     * 标题颜色
     */
    color?: string
}

export interface IDebugLogOptions {
    /**
     * 标题数组，从左到右依次为主标题、次级标题等
     */
    tittle?: IDebugTitleItem[]
    /**
     * 是否加粗显示参数文本
     */
    bold?: boolean
}

/**
 * 判断是否为日志选项对象
 */
function isDebugLogOptions(value: any): value is IDebugLogOptions {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false
    }

    return 'tittle' in value || 'bold' in value
}

interface INormalizedDebugLog {
    /**
     * 用于显示和写入日志的参数
     */
    args: any[]
    /**
     * 标题文本列表
     */
    titleTexts: string[]
    /**
     * 日志选项
     */
    options: IDebugLogOptions
}

export const defaultDebugTitle: IDebugTitleItem = {
    text: 'app',
    color: '#f472b6'
}

/**
 * 将 consola 日志类型映射到当前 IPC 支持的日志类型
 */
const logTypeMap: Partial<Record<LogType, 'log' | 'error' | 'warn' | 'info'>> = {
    fatal: 'error',
    error: 'error',
    warn: 'warn',
    log: 'log',
    info: 'info',
    success: 'info',
    fail: 'warn',
    ready: 'info',
    start: 'info',
    box: 'log',
    debug: 'log',
    trace: 'log',
    verbose: 'log'
}

/**
 * 获取要显示在徽标中的日志文本
 */
function getBadgeText(type: LogType) {
    return type
}

/**
 * 根据日志级别获取浏览器控制台方法
 */
function getConsoleLogFn(level: number) {
    if (level < 1) {
        return console.error
    }
    if (level === 1) {
        return console.warn
    }

    return console.log
}

/**
 * 获取日志标志颜色
 */
function getBadgeColor(logObj: { level: number; type: LogType }) {
    const defaultColor = '#7f8c8d'
    const levelColorMap: Partial<Record<number, string>> = {
        0: '#c0392b',
        1: '#f39c12',
        3: '#00BCD4'
    }
    const typeColorMap: Partial<Record<LogType, string>> = {
        success: '#2ecc71',
        debug: '#8e44ad'
    }

    return typeColorMap[logObj.type] || levelColorMap[logObj.level] || defaultColor
}

/**
 * 将输入参数归一化
 */
export function normalizeLogInput(argOrArgs: any[] | any, options?: IDebugLogOptions) {
    const args = Array.isArray(argOrArgs) ? argOrArgs : [argOrArgs]
    const normalizedOptions: IDebugLogOptions = {
        ...options,
        tittle: options?.tittle?.length ? options.tittle : [defaultDebugTitle]
    }

    return {
        args,
        titleTexts: (normalizedOptions.tittle || []).map((item) => item.text),
        options: normalizedOptions
    } satisfies INormalizedDebugLog
}

/**
 * 自定义浏览器 reporter，支持标题和参数加粗
 */
const browserLogReporter: ConsolaReporter = {
    log(logObj) {
        const consoleLogFn = getConsoleLogFn(logObj.level as number)
        const type = getBadgeText(logObj.type)
        const color = getBadgeColor({
            level: logObj.level as number,
            type: logObj.type
        })
        const badgeStyle = `
            background: ${color};
            border-radius: 0.5em;
            color: white;
            font-weight: bold;
            padding: 2px 0.5em;
        `
        const debugOptions = (logObj.debugOptions || {}) as IDebugLogOptions
        const titles = debugOptions.tittle || []
        const formatParts: string[] = []
        const styles: string[] = []
        const pushBadge = (text: string, style: string) => {
            if (formatParts.length > 0) {
                formatParts.push('%c ')
                styles.push('')
            }
            formatParts.push(`%c${text}`)
            styles.push(style)
        }

        titles.forEach((item) => {
            pushBadge(
                item.text,
                `
                    background: white;
                    border-radius: 0.5em;
                    border: 1px solid ${item.color || '#7f8c8d'};
                    color: ${item.color || '#7f8c8d'};
                    padding: 2px 0.5em;
                `
            )
        })

        pushBadge(type, badgeStyle)

        if (typeof logObj.args[0] === 'string') {
            formatParts.push(`%c %c${logObj.args[0]}`)
            styles.push('', debugOptions.bold ? 'font-weight: bold;' : '')
            consoleLogFn(formatParts.join(''), ...styles, ...logObj.args.slice(1))
            return
        }

        formatParts.push('%c ')
        styles.push('')
        consoleLogFn(formatParts.join(''), ...styles, ...logObj.args)
    }
}

/**
 * 自定义 reporter，将 consola 日志同步写入主进程日志文件
 */
const ipcLogReporter: ConsolaReporter = {
    log(logObj) {
        const type = logTypeMap[logObj.type]
        if (!type) {
            return
        }

        const debugOptions = (logObj.debugOptions || {}) as IDebugLogOptions
        const titleTexts = (debugOptions.tittle || []).map((item) => item.text)
        Ipc.filesystem.writeLog(type, ...titleTexts, ...logObj.args)
    }
}

/**
 * 带有 IPC 日志转发能力的 consola 实例
 */
const logger = consola.create({
    level: LogLevels.debug,
    reporters: [browserLogReporter, ipcLogReporter]
})

/**
 * 日志相关
 */
export class LogHelper {
    /**
     * 解析日志输入参数
     */
    private static parseLogArgs(
        argOrArgs: any[] | any,
        optionsOrArg?: IDebugLogOptions | any,
        ...restArgs: any[]
    ) {
        if (restArgs.length > 0) {
            return normalizeLogInput([argOrArgs, optionsOrArg, ...restArgs])
        }

        if (Array.isArray(argOrArgs)) {
            return normalizeLogInput(
                argOrArgs,
                isDebugLogOptions(optionsOrArg) ? optionsOrArg : undefined
            )
        }

        if (isDebugLogOptions(optionsOrArg)) {
            return normalizeLogInput(argOrArgs, optionsOrArg)
        }

        if (optionsOrArg !== undefined) {
            return normalizeLogInput([argOrArgs, optionsOrArg])
        }

        return normalizeLogInput(argOrArgs)
    }

    /**
     * 打印成功的日志
     */
    static success(...args: any[]): void
    static success(arg: any, options?: IDebugLogOptions): void
    static success(args: any[], options?: IDebugLogOptions): void
    static success(
        argOrArgs: any[] | any,
        optionsOrArg?: IDebugLogOptions | any,
        ...restArgs: any[]
    ) {
        const normalized = this.parseLogArgs(argOrArgs, optionsOrArg, ...restArgs)
        logger.success({
            args: normalized.args,
            debugOptions: normalized.options
        })
    }

    /**
     * 打印信息日志
     */
    static log(...args: any[]): void
    static log(arg: any, options?: IDebugLogOptions): void
    static log(args: any[], options?: IDebugLogOptions): void
    static log(argOrArgs: any[] | any, optionsOrArg?: IDebugLogOptions | any, ...restArgs: any[]) {
        const normalized = this.parseLogArgs(argOrArgs, optionsOrArg, ...restArgs)
        logger.log({
            args: normalized.args,
            debugOptions: normalized.options
        })
    }

    /**
     * 打印调试日志
     */
    static debug(...args: any[]): void
    static debug(arg: any, options?: IDebugLogOptions): void
    static debug(args: any[], options?: IDebugLogOptions): void
    static debug(
        argOrArgs: any[] | any,
        optionsOrArg?: IDebugLogOptions | any,
        ...restArgs: any[]
    ) {
        const normalized = this.parseLogArgs(argOrArgs, optionsOrArg, ...restArgs)
        logger.debug({
            args: normalized.args,
            debugOptions: normalized.options
        })
    }

    /**
     * 打印警告日志
     */
    static warn(...args: any[]): void
    static warn(arg: any, options?: IDebugLogOptions): void
    static warn(args: any[], options?: IDebugLogOptions): void
    static warn(argOrArgs: any[] | any, optionsOrArg?: IDebugLogOptions | any, ...restArgs: any[]) {
        const normalized = this.parseLogArgs(argOrArgs, optionsOrArg, ...restArgs)
        logger.warn({
            args: normalized.args,
            debugOptions: normalized.options
        })
    }

    /**
     * 打印错误日志
     */
    static error(...args: any[]): void
    static error(arg: any, options?: IDebugLogOptions): void
    static error(args: any[], options?: IDebugLogOptions): void
    static error(
        argOrArgs: any[] | any,
        optionsOrArg?: IDebugLogOptions | any,
        ...restArgs: any[]
    ) {
        const normalized = this.parseLogArgs(argOrArgs, optionsOrArg, ...restArgs)
        logger.error({
            args: normalized.args,
            debugOptions: normalized.options
        })
    }
}
