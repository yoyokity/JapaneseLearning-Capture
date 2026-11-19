import type { ISearchEngine, ISearchEngineConfig } from './types'

import { search as deepseekSearch } from './deepseek'
import { search as tavilySearch } from './tavily'

export * from './types'

/**
 * 创建搜索引擎
 * @param config 引擎配置
 */
export function createSearchEngine(config: ISearchEngineConfig): ISearchEngine {
    if (config.provider === 'tavily') {
        return {
            search: (options) => tavilySearch(options, config)
        }
    }

    return {
        search: (options) => deepseekSearch(options, config)
    }
}
