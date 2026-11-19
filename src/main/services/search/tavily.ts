import type {
    FetchFormat,
    IFetchPageOptions,
    IFetchPageResponse,
    ISearchOptions,
    ISearchResponse,
    ITavilyConfig,
    SearchDepth,
    SearchTimeRange,
    SearchTopic
} from './types'

import { post } from '../../utils/net'

/** 默认接口地址 */
const DEFAULT_BASE_URL = 'https://api.tavily.com'
/** 默认返回条数 */
const DEFAULT_MAX_RESULTS = 5
/** 搜索结果条数上限 */
const MAX_RESULTS_LIMIT = 20
/** 单次提取网页数量上限 */
const MAX_EXTRACT_URLS = 20
/** 默认请求超时（毫秒） */
const DEFAULT_TIMEOUT = 30_000

/**
 * Tavily 错误响应
 */
interface ITavilyError {
    detail?: string | { error?: string }
}

/**
 * Tavily 搜索请求体
 */
interface ITavilySearchRequest {
    query: string
    search_depth: SearchDepth
    max_results: number
    topic: SearchTopic
    include_answer: boolean
    include_raw_content: boolean
    include_domains?: string[]
    exclude_domains?: string[]
    time_range?: SearchTimeRange
    days?: number
}

/**
 * Tavily 原始搜索结果
 */
interface ITavilySearchResponse extends ITavilyError {
    query?: string
    answer?: string
    results?: {
        title?: string
        url?: string
        content?: string
        score?: number
        raw_content?: string
        published_date?: string
    }[]
    response_time?: number
}

/**
 * Tavily 网页提取请求体
 */
interface ITavilyExtractRequest {
    urls: string[]
    extract_depth: SearchDepth
    format: FetchFormat
    include_images: boolean
    include_favicon: boolean
    query?: string
}

/**
 * Tavily 原始网页提取结果
 */
interface ITavilyExtractResponse extends ITavilyError {
    results?: {
        url?: string
        raw_content?: string
        images?: string[]
        favicon?: string
    }[]
    failed_results?: { url?: string; error?: string }[]
    response_time?: number
}

/**
 * 发送 Tavily 请求并处理鉴权与错误
 * @param path 接口路径
 * @param body 请求体
 * @param config 引擎配置
 */
async function request<T extends ITavilyError>(
    path: string,
    body: unknown,
    config: ITavilyConfig
): Promise<T> {
    const apiKey = config.apiKey
    if (!apiKey) {
        throw new Error('未配置 Tavily API Key')
    }

    const response = await post(`${config.baseUrl ?? DEFAULT_BASE_URL}${path}`, body, {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: config.timeout ?? DEFAULT_TIMEOUT,
        parse: 'json'
    })
    const data = response.body as T | null

    if (!response.ok) {
        const detail = data?.detail
        const message = typeof detail === 'string' ? detail : detail?.error
        throw new Error(`Tavily 请求失败（${response.status}）${message ? `：${message}` : ''}`)
    }

    return data as T
}

/**
 * 使用 Tavily 执行网页搜索
 * @param options 搜索参数
 * @param config 引擎配置
 */
export async function search(
    options: ISearchOptions,
    config: ITavilyConfig = {}
): Promise<ISearchResponse> {
    const query = options.query.trim()
    if (!query) {
        throw new Error('搜索关键词不能为空')
    }

    const tavilyOptions = options.providerOptions?.tavily
    const body: ITavilySearchRequest = {
        query,
        search_depth: tavilyOptions?.searchDepth ?? config.defaultDepth ?? 'basic',
        max_results: Math.min(
            Math.max(options.maxResults ?? DEFAULT_MAX_RESULTS, 1),
            MAX_RESULTS_LIMIT
        ),
        topic: tavilyOptions?.topic ?? 'general',
        include_answer: options.includeAnswer ?? false,
        include_raw_content: options.includeRawContent ?? false
    }
    if (options.includeDomains?.length) body.include_domains = options.includeDomains
    if (options.excludeDomains?.length) body.exclude_domains = options.excludeDomains
    if (options.timeRange) body.time_range = options.timeRange
    if (options.days != null) body.days = options.days

    const data = await request<ITavilySearchResponse>('/search', body, config)
    const results = data.results
    if (!Array.isArray(results)) {
        throw new TypeError('Tavily 返回格式无效')
    }

    return {
        query: data.query ?? query,
        ...(data.answer ? { answer: data.answer } : {}),
        results: results.flatMap((item) =>
            item.url
                ? [
                      {
                          title: item.title ?? '',
                          url: item.url,
                          content: item.content ?? '',
                          score: item.score ?? 0,
                          ...(item.raw_content ? { rawContent: item.raw_content } : {}),
                          ...(item.published_date ? { publishedDate: item.published_date } : {})
                      }
                  ]
                : []
        ),
        responseTime: data.response_time ?? 0,
        provider: 'tavily'
    }
}

/**
 * 使用 Tavily 提取网页内容
 * @param urls 网页地址，单个或数组，单次最多 20 个
 * @param options 提取参数
 * @param config 引擎配置
 */
export async function fetchPage(
    urls: string | string[],
    options: IFetchPageOptions = {},
    config: ITavilyConfig = {}
): Promise<IFetchPageResponse> {
    const urlList = (Array.isArray(urls) ? urls : [urls]).map((url) => url.trim()).filter(Boolean)
    if (!urlList.length) {
        throw new Error('网页地址不能为空')
    }
    if (urlList.length > MAX_EXTRACT_URLS) {
        throw new Error(`单次最多提取 ${MAX_EXTRACT_URLS} 个网页`)
    }

    const body: ITavilyExtractRequest = {
        urls: urlList,
        extract_depth: options.extractDepth ?? 'basic',
        format: options.format ?? 'markdown',
        include_images: options.includeImages ?? false,
        include_favicon: options.includeFavicon ?? false
    }
    if (options.query) body.query = options.query

    const data = await request<ITavilyExtractResponse>('/extract', body, config)
    const results = data.results
    if (!Array.isArray(results)) {
        throw new TypeError('Tavily 返回格式无效')
    }

    return {
        results: results.flatMap((item) =>
            item.url
                ? [
                      {
                          url: item.url,
                          content: item.raw_content ?? '',
                          ...(item.images?.length ? { images: item.images } : {}),
                          ...(item.favicon ? { favicon: item.favicon } : {})
                      }
                  ]
                : []
        ),
        failedResults: (data.failed_results ?? []).map((item) => ({
            url: item.url ?? '',
            error: item.error ?? '提取失败'
        })),
        responseTime: data.response_time ?? 0,
        provider: 'tavily'
    }
}
