/**
 * debug相关，用于调试、日志记录等
 */
export class DebugHelper {
	static info(...args: any[]) {
		console.info(...args)
	}

	static warn(...args: any[]) {
		console.warn(...args)
	}

	static error(...args: any[]) {
		console.error(...args)

		let text = args
			.map((arg) => {
				if (arg === null) return 'null'
				if (arg === undefined) return 'undefined'
				//处理Error
				if (arg instanceof Error) return `${arg.name}: ${arg.message}\n${arg.stack}`
				//处理Neutralino Error
				if (typeof arg === 'object' && 'message' in arg && 'code' in arg) return arg.message
				return arg.toString()
			})
			.join(' ')

		console.log(text)
	}

	/**
	 * 执行函数并返回结果及执行时间
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
	 * @returns 包含执行结果和可能的错误的对象，如果有报错则result为null，无报错则error为null
	 * @example
	 * ```ts
	 * const { result, error } = await debug.tryExecute(someFunction, arg1, arg2);
	 * ```
	 */
	static async tryExecute<T>(
		fn: (...args: any[]) => T | Promise<T>,
		...args: any[]
	): Promise<{ result: T | null; error: unknown | null }> {
		try {
			const result = await fn(...args)
			return {
				result,
				error: null
			}
		} catch (error) {
			return {
				result: null,
				error
			}
		}
	}

	/**
	 * 通过try-catch同步执行函数并返回结果或错误
	 * @param fn 要执行的函数
	 * @param args 函数参数
	 * @returns 包含执行结果和可能的错误的对象，如果有报错则result为null，无报错则error为null
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
	): { result: T | null; error: unknown | null } {
		try {
			const result = fn(...args)
			return {
				result,
				error: null
			}
		} catch (error) {
			return {
				result: null,
				error
			}
		}
	}
}
