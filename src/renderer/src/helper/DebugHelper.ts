import { Ipc } from '@renderer/ipc'

/**
 * debug相关，用于调试、日志记录等
 */
export class DebugHelper {
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
}
