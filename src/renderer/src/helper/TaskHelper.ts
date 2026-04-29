import { delay } from 'es-toolkit'
import PQueue from 'p-queue'

export type IResultWithError<T> =
    | {
          result: T
          hasError: false
          /**
           * 错误信息，如果没有错误则为 null
           */
          error?: null
      }
    | {
          result?: null
          hasError: true
          /**
           * 错误信息，如果有错误则为错误对象或错误信息
           */
          error: any
      }

export interface IQueueWithIntervalOptions {
    /**
     * 任务名称，相同名称的任务会共享同一个队列和间隔限制
     */
    taskName?: string
    /**
     * 最小间隔时间（毫秒）
     */
    intervalMs?: number
    /**
     * 是否在任务执行后更新最后执行时间
     * true表示在任务结束时更新，false表示在任务开始时更新
     */
    updateTimeAfterExecution?: boolean
}

/**
 * 任务执行相关
 */
export class TaskHelper {
    /**
     * 任务队列映射，用于存储不同任务名称的队列
     */
    private static _taskQueues: Map<string, PQueue> = new Map()
    /**
     * 任务最后执行时间映射
     */
    private static _lastExecutionTimes: Map<string, number> = new Map()

    /**
     * 使用队列执行函数，确保同名任务之间的执行间隔不小于指定时间
     * @param [options] 队列配置
     * @param fn 要执行的函数
     * @returns 函数执行的结果
     * @example
     * ```ts
     * // 确保名为"api-call"的任务每次执行间隔至少为1000毫秒
     * const result = await TaskHelper.queueWithInterval(
     *   {
     *     taskName: 'api-call',
     *     intervalMs: 1000
     *   },
     *   () => fetchData(param1, param2)
     * );
     *
     * const result = await TaskHelper.queueWithInterval(
     *   {
     *     taskName: 'api-call',
     *     intervalMs: 1000,
     *     updateTimeAfterExecution: true
     *   },
     *   () => fetchData(param1, param2)
     * );
     * ```
     */
    static async queueWithInterval<T>(
        options: IQueueWithIntervalOptions = {},
        fn: () => T | Promise<T>
    ): Promise<T> {
        const { taskName = 'default', intervalMs = 0, updateTimeAfterExecution = true } = options

        // 获取或创建任务队列
        if (!this._taskQueues.has(taskName)) {
            this._taskQueues.set(taskName, new PQueue({ concurrency: 1 }))
            this._lastExecutionTimes.set(taskName, 0)
        }

        const queue = this._taskQueues.get(taskName)!

        // 创建一个任务函数，用于在队列中执行
        const task = async (): Promise<T> => {
            const lastExecutionTime = this._lastExecutionTimes.get(taskName)!
            const now = Date.now()
            const timeSinceLastExecution = now - lastExecutionTime

            // 如果距离上次执行时间不足指定间隔，则等待
            if (timeSinceLastExecution < intervalMs) {
                const waitTime = intervalMs - timeSinceLastExecution
                await delay(waitTime)
            }

            // 如果选择在任务开始时更新最后执行时间
            if (!updateTimeAfterExecution) {
                this._lastExecutionTimes.set(taskName, Date.now())
            }

            // 执行函数
            const result = await fn()

            // 如果选择在任务结束时更新最后执行时间
            if (updateTimeAfterExecution) {
                this._lastExecutionTimes.set(taskName, Date.now())
            }

            return result
        }

        // 添加任务到队列并返回结果
        // 使用类型断言确保返回类型正确
        return queue.add(task) as Promise<T>
    }

    /**
     * 清除指定任务队列，取消所有待执行的任务
     * @param taskName 任务名称，如果不传则清除所有队列
     */
    static queueClear(taskName?: string | string[]): void {
        if (taskName) {
            const taskNames = Array.isArray(taskName) ? taskName : [taskName]

            for (const item of taskNames) {
                const queue = this._taskQueues.get(item)
                if (queue) {
                    queue.clear()
                    this._lastExecutionTimes.set(item, 0)
                }
            }
        } else {
            // 清除所有队列
            for (const queue of this._taskQueues.values()) {
                queue.clear()
            }
            this._lastExecutionTimes.clear()
            for (const taskName of this._taskQueues.keys()) {
                this._lastExecutionTimes.set(taskName, 0)
            }
        }
    }

    /**
     * 通过try-catch执行函数并返回结果或错误
     * @param fn 要执行的函数
     * @param args 函数参数
     * @returns 包含执行结果和可能的错误的对象，如果有报错则hasError为true
     * @example
     * ```ts
     * const { result, error, hasError } = await TaskHelper.tryExecute(someFunction, arg1, arg2);
     *
     * const { result, error, hasError } = await TaskHelper.tryExecute(() => someFunction(arg1, arg2));
     * ```
     */
    static async tryExecute<T>(
        fn: (...args: any[]) => T | Promise<T>,
        ...args: any[]
    ): Promise<IResultWithError<T>> {
        try {
            const result = await fn(...args)
            return {
                result,
                hasError: false,
                error: null
            }
        } catch (error) {
            return {
                result: null,
                hasError: true,
                error
            }
        }
    }

    /**
     * 通过try-catch同步执行函数并返回结果或错误
     * @param fn 要执行的函数
     * @param args 函数参数
     * @returns 包含执行结果和可能的错误的对象，如果有报错则hasError为true
     * @example
     * ```ts
     * const { result, error, hasError } = TaskHelper.tryExecuteSync(someFunction, arg1, arg2);
     *
     * const { result, error, hasError } = TaskHelper.tryExecuteSync(() => someFunction(arg1, arg2));
     * ```
     *
     * @warning 注意：如果传入的函数是异步函数（返回Promise），此方法不会等待Promise解析。
     * result将会是Promise对象本身，而不是Promise解析后的值。
     * 对于异步函数，请使用tryExecute方法代替。
     */
    static tryExecuteSync<T>(fn: (...args: any[]) => T, ...args: any[]): IResultWithError<T> {
        try {
            const result = fn(...args)
            return {
                result,
                hasError: false,
                error: null
            }
        } catch (error) {
            return {
                result: null,
                hasError: true,
                error
            }
        }
    }
}
