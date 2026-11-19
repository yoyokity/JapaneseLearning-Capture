/** 搜索服务提供方 */
export type SearchProvider = 'tavily' | 'deepseek'
/** 搜索深度 */
export type SearchDepth = 'basic' | 'advanced'
/** 搜索主题 */
export type SearchTopic = 'general' | 'news' | 'finance'
/** 时间范围 */
export type SearchTimeRange = 'day' | 'week' | 'month' | 'year'
/** 网页内容格式 */
export type FetchFormat = 'markdown' | 'text'

/**
 * 各 provider 专有的搜索参数
 */
export interface ISearchProviderOptions {
    /** 仅 Tavily */
    tavily?:
        | {
              /** 搜索深度 */
              searchDepth?: SearchDepth | undefined
              /** 搜索主题 */
              topic?: SearchTopic | undefined
          }
        | undefined
    /** 仅 DeepSeek */
    deepseek?:
        | {
              /** 用户原始问题，帮助理解搜索意图 */
              oriQuestion?: string | undefined
              /** 本地化 IP */
              localization?: string | undefined
          }
        | undefined
}

/**
 * 搜索参数
 */
export interface ISearchOptions {
    /** 搜索关键词 */
    query: string
    /** 返回条数：Tavily 1-20，DeepSeek 1-50 */
    maxResults?: number | undefined
    /** 是否生成一段总结，仅 Tavily */
    includeAnswer?: boolean | undefined
    /** 是否返回全文：Tavily raw_content，DeepSeek need_content */
    includeRawContent?: boolean | undefined
    /** 只搜索这些域名：Tavily 独立字段，DeepSeek 拼 site: */
    includeDomains?: string[] | undefined
    /** 排除这些域名：Tavily 独立字段，DeepSeek 拼 -site: */
    excludeDomains?: string[] | undefined
    /** 时间范围：Tavily 独立字段，DeepSeek 拼 after: 日期 */
    timeRange?: SearchTimeRange | undefined
    /** 最近 N 天，优先级高于 timeRange */
    days?: number | undefined
    /** provider 专有参数 */
    providerOptions?: ISearchProviderOptions | undefined
}

/**
 * 单条搜索结果
 */
export interface ISearchResult {
    /** 标题 */
    title: string
    /** 链接 */
    url: string
    /** 内容摘要 */
    content: string
    /** 相关度 0-1 */
    score: number
    /** 全文，includeRawContent 为 true 时返回 */
    rawContent?: string | undefined
    /** 发布时间 */
    publishedDate?: string | undefined
    /** 权威度 -1~4，仅 DeepSeek 返回 */
    authority?: number | undefined
}

/**
 * 搜索结果
 */
export interface ISearchResponse {
    /** 实际执行的查询 */
    query: string
    /** LLM 生成的总结，includeAnswer 为 true 时返回 */
    answer?: string | undefined
    /** 搜索结果 */
    results: ISearchResult[]
    /** 服务端耗时（秒） */
    responseTime: number
    /** 实际使用的搜索引擎 */
    provider: SearchProvider
}

/**
 * 网页提取参数
 */
export interface IFetchPageOptions {
    /** 提取深度，仅 Tavily */
    extractDepth?: SearchDepth | undefined
    /** 返回格式，仅 Tavily，DeepSeek 固定 markdown */
    format?: FetchFormat | undefined
    /** 是否返回页面图片，仅 Tavily */
    includeImages?: boolean | undefined
    /** 是否返回网站图标，仅 Tavily */
    includeFavicon?: boolean | undefined
    /** 按查询筛选相关片段，仅 Tavily */
    query?: string | undefined
}

/**
 * 单个网页的提取结果
 */
export interface IFetchPageResult {
    /** 网页地址 */
    url: string
    /** 页面标题，仅 DeepSeek 返回 */
    title?: string | undefined
    /** 网页内容 */
    content: string
    /** 页面图片，includeImages 为 true 时返回 */
    images?: string[] | undefined
    /** 网站图标，includeFavicon 为 true 时返回 */
    favicon?: string | undefined
}

/**
 * 网页提取结果
 */
export interface IFetchPageResponse {
    /** 提取成功的网页 */
    results: IFetchPageResult[]
    /** 提取失败的网页 */
    failedResults: { url: string; error: string }[]
    /** 服务端耗时（秒） */
    responseTime: number
    /** 实际使用的搜索引擎 */
    provider: SearchProvider
}

/**
 * 引擎通用配置
 */
export interface ISearchEngineBaseConfig {
    /** API Key */
    apiKey?: string | undefined
    /** 接口根地址，缺省用 provider 默认值 */
    baseUrl?: string | undefined
    /** 请求超时（毫秒），默认 30000 */
    timeout?: number | undefined
}

/**
 * Tavily 引擎配置
 */
export interface ITavilyConfig extends ISearchEngineBaseConfig {
    /** 默认搜索深度 */
    defaultDepth?: SearchDepth | undefined
}

/**
 * DeepSeek 引擎配置
 */
export interface IDeepSeekConfig extends ISearchEngineBaseConfig {
    /** 默认结果数，默认 10 */
    defaultCount?: number | undefined
}

/**
 * 搜索引擎配置（主进程完整版）
 */
export type ISearchEngineConfig =
    ({ provider: 'tavily' } & ITavilyConfig) | ({ provider: 'deepseek' } & IDeepSeekConfig)

/**
 * 搜索引擎
 */
export interface ISearchEngine {
    /** 搜索网页 */
    search: (options: ISearchOptions) => Promise<ISearchResponse>
    /** 提取网页内容，DeepSeek 会逐个请求 */
    fetchPage: (urls: string | string[], options?: IFetchPageOptions) => Promise<IFetchPageResponse>
}
