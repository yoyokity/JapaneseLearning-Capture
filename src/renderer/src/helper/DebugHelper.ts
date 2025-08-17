import { Ipc } from '@renderer/ipc'
import PQueue from 'p-queue'
import { delay } from 'es-toolkit'

/**
 * debug相关，用于调试、日志记录等
 */
export class DebugHelper {
	/**
	 * 任务队列映射，用于存储不同任务名称的队列
	 */
	private static _taskQueues: Map<string, PQueue> = new Map()
	/**
	 * 任务最后执行时间映射
	 */
	private static _lastExecutionTimes: Map<string, number> = new Map()

	/**
	 * 打印成功的日志
	 */
	static info(...args: any[]) {
		console.info(...args)
		Ipc.filesystem.writeLog('info', ...args)
	}

	/**
	 * 打印信息日志
	 */
	static log(...args: any[]) {
		console.log(...args)
		Ipc.filesystem.writeLog('log', ...args)
	}

	/**
	 * 打印警告日志
	 */
	static warn(...args: any[]) {
		console.warn(...args)
		Ipc.filesystem.writeLog('warn', ...args)
	}

	/**
	 * 打印错误日志
	 */
	static error(...args: any[]) {
		console.error(...args)
		Ipc.filesystem.writeLog('error', ...args)
	}

	/**
	 * 执行函数并返回结果及执行时间，毫秒
	 * @param fn 要执行的函数
	 * @param args 函数参数
	 * @returns 包含执行结果和执行时间的对象
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
	 * 通过try-catch执行函数并返回结果或错误
	 * @param fn 要执行的函数
	 * @param args 函数参数
	 * @returns 包含执行结果和可能的错误的对象，如果有报错则hasError为true
	 * @example
	 * ```ts
	 * const { result, error } = await debug.tryExecute(someFunction, arg1, arg2);
	 * ```
	 */
	static async tryExecute<T>(
		fn: (...args: any[]) => T | Promise<T>,
		...args: any[]
	): Promise<
		| { hasError: false; result: T; error: null }
		| { hasError: true; result: null; error: unknown }
	> {
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
	 * const { result, error } = debug.tryExecuteSync(someFunction, arg1, arg2);
	 * ```
	 *
	 * @warning 注意：如果传入的函数是异步函数（返回Promise），此方法不会等待Promise解析。
	 * result将会是Promise对象本身，而不是Promise解析后的值。
	 * 对于异步函数，请使用tryExecute方法代替。
	 */
	static tryExecuteSync<T>(
		fn: (...args: any[]) => T,
		...args: any[]
	):
		| { hasError: false; result: T; error: null }
		| { hasError: true; result: null; error: unknown } {
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

	/**
	 * 使用队列执行函数，确保同名任务之间的执行间隔不小于指定时间
	 * @param [taskName='default'] 任务名称，相同名称的任务会共享同一个队列和间隔限制
	 * @param [intervalMs=3000] 最小间隔时间（毫秒）
	 * @param [updateTimeAfterExecution=true] 是否在任务执行后更新最后执行时间，true表示在任务结束时更新，false表示在任务开始时更新
	 * @param fn 要执行的函数
	 * @param args 函数参数
	 * @returns 函数执行的结果
	 * @example
	 * ```ts
	 * // 确保名为"api-call"的任务每次执行间隔至少为1000毫秒
	 * const result = await DebugHelper.queueWithInterval(
	 *   "api-call",
	 *   1000,
	 *   fetchData,
	 *   param1, param2
	 * );
	 * ```
	 */
	static async queueWithInterval<T>(
		taskName: string = 'default',
		intervalMs: number = 3000,
		updateTimeAfterExecution: boolean = true,
		fn: (...args: any[]) => T | Promise<T>,
		...args: any[]
	): Promise<T> {
		// 获取或创建任务队列
		if (!this._taskQueues.has(taskName)) {
			this._taskQueues.set(taskName, new PQueue({ concurrency: 1 }))
			this._lastExecutionTimes.set(taskName, 0)
		}

		const queue = this._taskQueues.get(taskName)!
		const lastExecutionTime = this._lastExecutionTimes.get(taskName)!

		// 创建一个任务函数，用于在队列中执行
		const task = async (): Promise<T> => {
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
			const result = await fn(...args)

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
}
