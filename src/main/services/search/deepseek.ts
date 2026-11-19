import type {
    IDeepSeekConfig,
    IFetchPageOptions,
    IFetchPageResponse,
    IFetchPageResult,
    ISearchOptions,
    ISearchResponse,
    SearchTimeRange
} from './types'

import { post } from '../../utils/net'

/** 默认接口地址 */
const DEFAULT_BASE_URL = 'https://api.deepseek.com'
/** 搜索接口路径 */
const SEARCH_PATH = '/v1/tools/search'
/** 网页提取接口路径 */
const FETCH_PATH = '/v1/tools/fetch'
/** 默认返回条数 */
const DEFAULT_COUNT = 10
/** 搜索结果条数上限 */
const MAX_COUNT = 50
/** 默认请求超时（毫秒） */
const DEFAULT_TIMEOUT = 30_000
/** 时间范围对应的天数 */
const TIME_RANGE_DAYS: Record<SearchTimeRange, number> = {
    day: 1,
    week: 7,
    month: 30,
    year: 365
}

/**
 * DeepSeek 搜索请求体
 */
interface IDeepSeekSearchRequest {
    query: string
    count: number
    need_content: boolean
    ori_question?: string
    localization?: string
}

/**
 * DeepSeek 原始搜索结果
 */
interface IDeepSeekSearchResponse {
    results?: {
        title?: string
        url?: string
        snippet?: string
        summary?: string
        content?: string
        date?: string | null
        authority?: number
        rerank_score?: number
    }[]
}

/**
 * DeepSeek 原始网页提取结果
 */
interface IDeepSeekFetchResponse {
    title?: string
    content?: string
}

/**
 * DeepSeek 错误响应
 */
interface IDeepSeekErrorResponse {
    error?: string | { message?: string }
    detail?: string | { error?: string }
}

/**
 * 提取错误信息
 * @param body 响应体
 */
function getErrorMessage(body: unknown) {
    if (!body || typeof body !== 'object') return ''

    const { error, detail } = body as IDeepSeekErrorResponse
    if (typeof error === 'string') return error
    if (error && typeof error === 'object') return error.message ?? ''
    if (typeof detail === 'string') return detail
    if (detail && typeof detail === 'object') return detail.error ?? ''
    return ''
}

/**
 * 拼接 DeepSeek 的搜索运算符
 * @param options 搜索参数
 */
function buildQuery(options: ISearchOptions) {
    const parts = [options.query.trim()]
    for (const domain of options.includeDomains ?? []) {
        parts.push(`site:${domain}`)
    }
    for (const domain of options.excludeDomains ?? []) {
        parts.push(`-site:${domain}`)
    }

    const days = options.days ?? (options.timeRange ? TIME_RANGE_DAYS[options.timeRange] : 0)
    if (days > 0) {
        const after = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
        parts.push(`after:${after}`)
    }

    return parts.join(' ')
}

/**
 * 发送 DeepSeek 请求并处理鉴权与错误
 * @param path 接口路径
 * @param body 请求体
 * @param config 引擎配置
 */
async function request<T>(path: string, body: unknown, config: IDeepSeekConfig): Promise<T> {
    const { DEEPSEEK_API_KEY } = process.env
    const apiKey = config.apiKey || DEEPSEEK_API_KEY
    if (!apiKey) {
        throw new Error('未配置 DEEPSEEK_API_KEY')
    }

    const response = await post(`${config.baseUrl ?? DEFAULT_BASE_URL}${path}`, body, {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: config.timeout ?? DEFAULT_TIMEOUT,
        parse: 'json'
    })
    const data = response.body as T | null

    if (!response.ok) {
        const message = getErrorMessage(response.body)
        throw new Error(`DeepSeek 请求失败（${response.status}）${message ? `：${message}` : ''}`)
    }

    return data as T
}

/**
 * 使用 DeepSeek 执行网页搜索
 * @param options 搜索参数
 * @param config 引擎配置
 */
export async function search(
    options: ISearchOptions,
    config: IDeepSeekConfig = {}
): Promise<ISearchResponse> {
    const query = options.query.trim()
    if (!query) {
        throw new Error('搜索关键词不能为空')
    }

    const startTime = Date.now()
    const deepseekOptions = options.providerOptions?.deepseek
    const body: IDeepSeekSearchRequest = {
        query: buildQuery(options),
        count: Math.min(
            Math.max(options.maxResults ?? config.defaultCount ?? DEFAULT_COUNT, 1),
            MAX_COUNT
        ),
        need_content: options.includeRawContent ?? false
    }
    if (deepseekOptions?.oriQuestion) body.ori_question = deepseekOptions.oriQuestion
    if (deepseekOptions?.localization) body.localization = deepseekOptions.localization

    const data = await request<IDeepSeekSearchResponse>(SEARCH_PATH, body, config)
    const results = data.results
    if (!Array.isArray(results)) {
        throw new TypeError('DeepSeek 返回格式无效')
    }

    return {
        query,
        results: results.flatMap((item) =>
            item.url
                ? [
                      {
                          title: item.title ?? '',
                          url: item.url,
                          content: item.summary ?? item.snippet ?? '',
                          score: (item.rerank_score ?? 0) / 3,
                          ...(item.content ? { rawContent: item.content } : {}),
                          ...(item.date ? { publishedDate: item.date } : {}),
                          ...(item.authority != null ? { authority: item.authority } : {})
                      }
                  ]
                : []
        ),
        responseTime: (Date.now() - startTime) / 1000,
        provider: 'deepseek'
    }
}

/**
 * 使用 DeepSeek 提取网页内容
 * @param urls 网页地址，单个或数组，多个时串行请求
 * @param _options 提取参数，DeepSeek 不支持，忽略
 * @param config 引擎配置
 */
export async function fetchPage(
    urls: string | string[],
    _options: IFetchPageOptions = {},
    config: IDeepSeekConfig = {}
): Promise<IFetchPageResponse> {
    const urlList = (Array.isArray(urls) ? urls : [urls]).map((url) => url.trim()).filter(Boolean)
    if (!urlList.length) {
        throw new Error('网页地址不能为空')
    }

    const startTime = Date.now()
    const results: IFetchPageResult[] = []
    const failedResults: { url: string; error: string }[] = []

    // DeepSeek 单次只支持一个 URL，串行请求避免触发 5 QPS 限制
    for (const url of urlList) {
        try {
            const data = await request<IDeepSeekFetchResponse>(FETCH_PATH, { url }, config)
            results.push({
                url,
                ...(data.title ? { title: data.title } : {}),
                content: data.content ?? ''
            })
        } catch (error) {
            failedResults.push({
                url,
                error: error instanceof Error ? error.message : String(error)
            })
        }
    }

    return {
        results,
        failedResults,
        responseTime: (Date.now() - startTime) / 1000,
        provider: 'deepseek'
    }
}
