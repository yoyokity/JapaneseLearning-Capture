/**
 * 调试相关
 */
export class DebugHelper {
    /**
     * 执行函数并返回结果及执行时间，毫秒
     * @param fn 要执行的函数
     * @param args 函数参数
     * @returns
     * result: 函数执行结果
     * executionTime: 函数执行耗时，单位毫秒
     * @example
     * ```ts
     * const { result, executionTime } = await DebugHelper.executeWithTime(
     *     fetchData,
     *     'keyword'
     * )
     *
     * const { result, executionTime } = await DebugHelper.executeWithTime(() => fetchData('keyword'))
     *
     * LogHelper.log([`执行耗时: ${executionTime}ms`, result])
     * ```
     */
    static async executeWithTime<T>(
        fn: (...args: any[]) => T | Promise<T>,
        ...args: any[]
    ): Promise<{ result: T; executionTime: number }> {
        const startTime = performance.now()
        const result = await fn(...args)
        const endTime = performance.now()
        const executionTime = endTime - startTime

        return {
            result,
            executionTime
        }
    }
}
