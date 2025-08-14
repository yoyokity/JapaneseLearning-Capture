import axios, {
	type AxiosInstance,
	type AxiosProxyConfig,
	type AxiosRequestConfig,
	type RawAxiosRequestHeaders
} from 'axios'
import { delay } from 'es-toolkit'
import { DebugHelper } from './DebugHelper.ts'

/**
 * HTTP 请求相关
 */
export class HttpHelper {
	/**
	 * 超时时间
	 */
	static timeout = 10000
	/**
	 * 重试次数
	 */
	static retry = 3
	/**
	 * 每个实例每次发送请求的间隔时间
	 */
	static delay = 3000
	/**
	 * 代理
	 */
	static proxy: AxiosProxyConfig | null = null
	private readonly baseUrl: string
	private readonly instance: AxiosInstance
	private lastRequestTime: number = 0

	private constructor(baseUrl?: string, headers?: RawAxiosRequestHeaders) {
		this.baseUrl = baseUrl || ''
		const config: AxiosRequestConfig = {
			baseURL: this.baseUrl,
			timeout: HttpHelper.timeout
		}

		// 添加请求头
		if (headers) {
			config.headers = headers
		}

		// 只有当代理不为null时才添加到配置中
		if (HttpHelper.proxy) {
			config.proxy = HttpHelper.proxy
		}

		this.instance = axios.create(config)

		// 请求拦截器
		this.instance.interceptors.request.use(
			async (config) => {
				// 确保请求之间的最小间隔
				const now = Date.now()
				const timeSinceLastRequest = now - this.lastRequestTime

				// 判断是否为图片请求
				const isImageRequest =
					config.url?.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i) ||
					(typeof config.headers?.['Content-Type'] === 'string' &&
						config.headers['Content-Type'].includes('image')) ||
					config.responseType === 'blob' ||
					config.url?.includes('image')

				// 如果不是图片请求，则应用间隔延迟限制
				if (
					!isImageRequest &&
					timeSinceLastRequest < HttpHelper.delay &&
					this.lastRequestTime !== 0
				) {
					// 需要等待的时间
					const waitTime = HttpHelper.delay - timeSinceLastRequest
					await delay(waitTime)
				}

				// 更新最后请求时间
				this.lastRequestTime = Date.now()

				return config
			},
			(error) => {
				return Promise.reject(error)
			}
		)

		// 响应拦截器
		this.instance.interceptors.response.use(
			(response) => {
				return response
			},
			(error) => {
				return Promise.reject(error)
			}
		)
	}

	/**
	 * 创建 HttpClient 实例
	 * @param baseUrl 基础 URL
	 * @param headers 请求头
	 */
	static create(baseUrl?: string, headers?: RawAxiosRequestHeaders): HttpHelper {
		return new HttpHelper(baseUrl, headers)
	}

	/**
	 * 发送 GET 请求
	 * @param url 请求路径
	 * @param params 查询参数
	 * @returns Promise 包含响应数据，错误时返回 null
	 */
	async get<T>(url: string, params?: Record<string, any>): Promise<T | null> {
		const config: AxiosRequestConfig = { params }

		const re = await DebugHelper.tryExecute(this.sendRequestWithRetry<T>, () =>
			this.instance.get<T>(url, config)
		)

		if (!re.hasError) {
			return re.result
		} else {
			DebugHelper.error(`GET请求错误，url：${url}\n`, re.error)
			return null
		}
	}

	/**
	 * 发送 POST 请求
	 * @param url 请求路径
	 * @param data 请求体数据
	 * @param headers 请求头
	 * @returns Promise 包含响应数据，错误时返回 null
	 */
	async post<T>(url: string, data?: any, headers?: RawAxiosRequestHeaders): Promise<T | null> {
		// 深度处理对象中的所有字符串字段，去除空格和换行
		if (data) {
			data = this.deepTrimData(data)
		}

		const config: AxiosRequestConfig = {}
		if (headers) {
			config.headers = headers
		}

		const re = await DebugHelper.tryExecute(this.sendRequestWithRetry<T>, () =>
			this.instance.post<T>(url, data, config)
		)

		if (!re.hasError) {
			return re.result
		} else {
			DebugHelper.error(`Post请求错误，url：${url}\n`, re.error)
			return null
		}
	}

	/**
	 * 使用重试机制发送请求
	 * @param requestFn 请求函数
	 * @returns Promise 包含响应数据
	 */
	private async sendRequestWithRetry<T>(requestFn: () => Promise<any>): Promise<T> {
		let retries = 0
		let lastError: any = null

		while (retries <= HttpHelper.retry) {
			if (retries > 0) DebugHelper.warn(`请求失败，进行第${retries}次重试`)

			try {
				const response = await requestFn()
				return response.data
			} catch (error) {
				lastError = error
				retries++

				if (retries >= HttpHelper.retry + 1) {
					break
				}
			}
		}

		throw lastError
	}

	/**
	 * 递归处理对象中的所有字符串字段，去除两边的空格和换行
	 * @param data 需要处理的数据
	 * @returns 处理后的数据
	 */
	private deepTrimData(data: any): any {
		if (!data) return data

		// 处理字符串
		if (typeof data === 'string') {
			return data.trim()
		}

		// 处理数组
		if (Array.isArray(data)) {
			return data.map((item) => this.deepTrimData(item))
		}

		// 处理对象
		if (typeof data === 'object') {
			const result = { ...data }
			Object.keys(result).forEach((key) => {
				result[key] = this.deepTrimData(result[key])
			})
			return result
		}

		// 其他类型直接返回
		return data
	}
}
