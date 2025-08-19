import { settingsStore } from '@renderer/stores/settings.ts'
import { Ipc } from '@renderer/ipc'
import { DebugHelper } from '@renderer/helper/DebugHelper.ts'
import { IFetchOptions, IFetchParse, IResult, ParseResultType } from '@renderer/ipc/net.ts'

/**
 * 网络相关
 */
export class NetHelper {
	/**
	 * 设置代理
	 */
	static async setProxy(enable: boolean, host: string, port: string) {
		if (enable && host && port) {
			const proxyRules = `http://${host}:${port}`
			const proxyBypassRules = 'localhost'

			const re = await DebugHelper.tryExecute(Ipc.net.setProxy, {
				proxyRules,
				proxyBypassRules
			})
			if (!re.hasError) {
				DebugHelper.info(`设置网络代理成功：`, proxyRules)
			} else {
				DebugHelper.error(`设置网络代理失败：`, re.error)
			}
		} else {
			const re = await DebugHelper.tryExecute(Ipc.net.clearProxy)
			if (!re.hasError) {
				DebugHelper.info(`取消网络代理`)
			} else {
				DebugHelper.error(`取消网络代理失败：`, re.error)
			}
		}
	}

	/**
	 * GET请求
	 * @param url
	 * @param [parse='text'] 将返回的body数据解析成什么类型
	 * @param headers
	 * @param [options] 请求选项，当前请求会覆盖掉settings设置的
	 * @return 只有status在200-299之间，ok字段才为true
	 * @example
	 * ```ts
	 * const re = await NetHelper.get('https://www.google.com')
	 * if (re.ok) {
	 *     console.log(re.body)
	 * }
	 * ```
	 */
	static async get<P extends IFetchParse>(
		url: string,
		parse: P = 'text' as P,
		headers?: Record<string, string>,
		options?: IRequestOptions
	): Promise<IResult<ParseResultType<P>>> {
		const settings = settingsStore()
		let timeout: number = settings.net.timeout * 1000
		let delay: number = settings.net.delay
		let retry: number = settings.net.retry

		if (options) {
			timeout = options.timeout || options.timeout === 0 ? options.timeout : timeout
			delay = options.delay || options.delay === 0 ? options.delay : delay
			retry = options.retry || options.retry === 0 ? options.retry : retry
		}

		const config: IFetchOptions = {
			headers,
			timeout,
			parse
		}

		let re
		let retryCount = 0

		// 失败则重试
		do {
			if (retryCount > 0) {
				DebugHelper.warn(`GET请求重试第${retryCount}次：${url}`)
			}

			if (retry > 0) {
				const hostName = new URL(url).hostname
				re = await DebugHelper.queueWithInterval(hostName, delay, false, async () =>
					DebugHelper.tryExecute(async () => await Ipc.net.get(url, config))
				)
			} else {
				re = await DebugHelper.tryExecute(async () => await Ipc.net.get(url, config))
			}

			if (!re.hasError) {
				const result = re.result as IResult<ParseResultType<P>>
				if (result.ok) {
					return result
				}
			} else {
				DebugHelper.error(`GET请求失败：${url}`, re.error)
			}

			retryCount++
		} while (retryCount <= retry)

		return {
			ok: false,
			status: -1,
			statusText: '',
			headers: {},
			body: undefined as any
		}
	}

	/**
	 * POST请求
	 * @param url
	 * @param data 请求体body数据
	 * @param [parse='text'] 将返回的body数据解析成什么类型
	 * @param headers
	 * @param [options] 请求选项，当前请求会覆盖掉settings设置的
	 * @return 只有status在200-299之间，ok字段才为true
	 * @example
	 * ```ts
	 * const re = await NetHelper.post('https://api.example.com', { name: 'test' })
	 * if (re.ok) {
	 *     console.log(re.body)
	 * }
	 * ```
	 */
	static async post<P extends IFetchParse>(
		url: string,
		data: any,
		parse: P = 'text' as P,
		headers?: Record<string, string>,
		options?: IRequestOptions
	): Promise<IResult<ParseResultType<P>>> {
		const settings = settingsStore()
		let timeout: number = settings.net.timeout * 1000
		let delay: number = settings.net.delay
		let retry: number = settings.net.retry

		if (options) {
			timeout = options.timeout || options.timeout === 0 ? options.timeout : timeout
			delay = options.delay || options.delay === 0 ? options.delay : delay
			retry = options.retry || options.retry === 0 ? options.retry : retry
		}

		const config: IFetchOptions = {
			headers,
			timeout,
			parse
		}

		let re
		let retryCount = 0

		// 失败则重试
		do {
			if (retryCount > 0) {
				DebugHelper.warn(`POST请求重试第${retryCount}次：${url}`)
			}

			if (retry > 0) {
				const hostName = new URL(url).hostname
				re = await DebugHelper.queueWithInterval(hostName, delay, false, async () =>
					DebugHelper.tryExecute(async () => await Ipc.net.post(url, data, config))
				)
			} else {
				re = await DebugHelper.tryExecute(async () => await Ipc.net.post(url, data, config))
			}

			if (!re.hasError) {
				const result = re.result as IResult<ParseResultType<P>>
				if (result.ok) {
					return result
				} else {
					DebugHelper.warn(`POST请求失败：${url}`, re.result)
				}
			} else {
				DebugHelper.error(`POST请求失败：${url}`, re.error)
			}

			retryCount++
		} while (retryCount <= retry)

		return {
			ok: false,
			status: -1,
			statusText: '',
			headers: {},
			body: undefined as any
		}
	}
}

export interface IRequestOptions {
	/**
	 * 请求超时时间
	 */
	timeout?: number
	/**
	 * 重试次数
	 */
	retry?: number
	/**
	 * 每次相同网站的请求间隔
	 */
	delay?: number
}
