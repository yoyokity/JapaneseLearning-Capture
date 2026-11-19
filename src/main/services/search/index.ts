import type { ISearchEngine, ISearchEngineConfig } from './types'

import { fetchPage as deepseekFetchPage, search as deepseekSearch } from './deepseek'
import { fetchPage as tavilyFetchPage, search as tavilySearch } from './tavily'

export * from './types'

/**
 * 创建搜索引擎
 * @param config 引擎配置
 */
export function createSearchEngine(config: ISearchEngineConfig): ISearchEngine {
    if (config.provider === 'tavily') {
        return {
            search: (options) => tavilySearch(options, config),
            fetchPage: (urls, options) => tavilyFetchPage(urls, options, config)
        }
    }

    return {
        search: (options) => deepseekSearch(options, config),
        fetchPage: (urls, options) => deepseekFetchPage(urls, options, config)
    }
}
