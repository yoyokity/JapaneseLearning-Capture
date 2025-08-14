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
export async function tryExecute<T>(
	fn: (...args: any[]) => T | Promise<T>,
	...args: any[]
): Promise<
	{ hasError: false; result: T; error: null } | { hasError: true; result: null; error: unknown }
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
export function tryExecuteSync<T>(
	fn: (...args: any[]) => T,
	...args: any[]
): { hasError: false; result: T; error: null } | { hasError: true; result: null; error: unknown } {
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
