import { ipc, sendTask } from '@renderer/ipc'

type LogType = 'success' | 'log' | 'debug' | 'warn' | 'error'

interface ITitle {
    /**
     * 标题文本
     */
    text: string
    /**
     * 标题颜色
     */
    color?: string
}

/**
 * 日志辅助类
 */
export class LogHelper {
    /**
     * 标题和标签的字体
     */
    private static fontFamily = '"PingFang SC", sans-serif'
    /**
     * 默认标题
     */
    private static defaultTitle: ITitle = {
        text: 'app',
        color: '#f472b6'
    }
    /**
     * 日志标签颜色映射
     */
    private static labelColorMap: Record<LogType, string> = {
        debug: '#8e44ad',
        success: '#2ecc71',
        error: '#c0392b',
        warn: '#f39c12',
        log: '#7f8c8d'
    }

    private titles: ITitle[]

    constructor(titles: ITitle[] = []) {
        this.titles = titles
    }

    /**
     * 添加标题
     */
    static title(text: string, color?: string) {
        return new LogHelper().title(text, color)
    }

    /**
     * 打印分隔线
     */
    static separator() {
        new LogHelper().debug('---------------')
    }

    /**
     * 打印成功日志
     */
    static success(...args: any[]) {
        new LogHelper().success(...args)
    }

    /**
     * 打印普通日志
     */
    static log(...args: any[]) {
        new LogHelper().log(...args)
    }

    /**
     * 打印调试日志
     */
    static debug(...args: any[]) {
        new LogHelper().debug(...args)
    }

    /**
     * 打印警告日志
     */
    static warn(...args: any[]) {
        new LogHelper().warn(...args)
    }

    /**
     * 打印错误日志
     * @remark 如果不是运行出错的报错，请使用warn
     */
    static error(...args: any[]) {
        new LogHelper().error(...args)
    }

    /**
     * 添加标题
     */
    title(text: string, color?: string) {
        return new LogHelper([...this.titles, { text, color }])
    }

    /**
     * 打印分隔线
     */
    separator() {
        this.print('debug', ['---------------'])
    }

    /**
     * 打印成功日志
     */
    success(...args: any[]) {
        this.print('success', args)
    }

    /**
     * 打印普通日志
     */
    log(...args: any[]) {
        this.print('log', args)
    }

    /**
     * 打印调试日志
     */
    debug(...args: any[]) {
        this.print('debug', args)
    }

    /**
     * 打印警告日志
     */
    warn(...args: any[]) {
        this.print('warn', args)
    }

    /**
     * 打印错误日志
     * @remark 如果不是运行出错的报错，请使用warn
     */
    error(...args: any[]) {
        this.print('error', args)
    }

    /**
     * 输出日志
     */
    private print(type: LogType, args: any[]) {
        const titles = this.titles.length ? this.titles : [LogHelper.defaultTitle]
        const callerLocation = this.getCallerLocation()
        this.printBrowserLog(type, titles, args, callerLocation)
        this.writeIpcLog(type, titles, args)
    }

    /**
     * 获取调用位置
     */
    private getCallerLocation() {
        const stack = new Error('LogHelper caller stack').stack
        if (!stack) {
            return ''
        }

        const stackLines = stack.split('\n').map((line) => line.trim())
        const callerLine = stackLines.find((line) => {
            return (
                line.startsWith('at ') &&
                !line.includes('getCallerLocation') &&
                !line.includes('printBrowserLog') &&
                !line.includes('writeIpcLog') &&
                !line.includes('print (') &&
                !line.includes('LogHelper.print') &&
                !line.includes('LogHelper.log') &&
                !line.includes('LogHelper.success') &&
                !line.includes('LogHelper.debug') &&
                !line.includes('LogHelper.warn') &&
                !line.includes('LogHelper.error') &&
                !line.includes('/node_modules/')
            )
        })

        return callerLine?.replace(/^at\s+/, '') || ''
    }

    /**
     * 打印浏览器日志
     */
    private printBrowserLog(type: LogType, titles: ITitle[], args: any[], callerLocation: string) {
        const color = LogHelper.labelColorMap[type]
        const labelStyle = `background: ${color};
            font-family: ${LogHelper.fontFamily};
            border-radius: 0.5em;
            color: white;
            padding: 2px 0.5em;`
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
                `background: white;
                font-family: ${LogHelper.fontFamily};
                border-radius: 0.5em;
                border: 1px solid ${item.color || LogHelper.defaultTitle.color};
                color: ${item.color || LogHelper.defaultTitle.color};
                padding: 2px 0.5em;`
            )
        })
        pushBadge(type, labelStyle)

        const isError = type === 'error'
        const consoleFn = isError ? console.error : console.groupCollapsed || console.log

        if (typeof args[0] === 'string') {
            formatParts.push('%c ')
            styles.push('')
            consoleFn(`${formatParts.join('')}${args[0]}`, ...styles, ...args.slice(1))
        } else {
            formatParts.push('%c ')
            styles.push('')
            consoleFn(formatParts.join(''), ...styles, ...args)
        }

        if (!isError && callerLocation) {
            console.log('%c调用位置：', 'color: gray;', callerLocation)
        }

        if (!isError && console.groupEnd) {
            console.groupEnd()
        }
    }

    /**
     * 写入日志文件
     */
    private writeIpcLog(type: LogType, titles: ITitle[], args: any[]) {
        const titleTexts = titles.map((item) => `[${item.text}]`)
        sendTask(
            ipc.filesystem.writeLog.mutate({
                type,
                params: [...titleTexts, ...args]
            })
        )
    }
}
