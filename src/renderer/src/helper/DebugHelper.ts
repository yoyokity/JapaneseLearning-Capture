import { Mutex } from 'es-toolkit'

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

    /**
     * 异步锁函数
     * @param fn 需要被包装的异步函数
     * @returns 包装后的异步函数，具备互斥特性
     */
    static withMutex<T extends (...args: any[]) => Promise<any>>(fn: T): T {
        const mutex = new Mutex()

        return (async (...args: any[]) => {
            // 1. 获取锁，如果锁被占用则等待
            await mutex.acquire()
            try {
                // 2. 执行原始函数的核心逻辑
                return await fn(...args)
            } finally {
                // 3. 无论成功或失败，都必须释放锁
                mutex.release()
            }
        }) as T
    }
}
