import type { SearchProvider } from '@shared'

/** 搜索服务商选项 */
export const SearchProviderOptions = [
    { label: 'Tavily', value: 'tavily' },
    { label: 'Deepseek', value: 'deepseek' }
] as const

/** 搜索服务商描述 */
export const SearchProviderDescriptions: Record<SearchProvider, string> = {
    tavily: '使用 Tavily 官方接口',
    deepseek: '使用 DeepSeek 官方接口'
}

/**
 * 搜索工具配置（renderer 精简版）
 */
export interface ISearchToolConfig {
    /** 搜索服务商 */
    provider: SearchProvider
    /** API Key */
    apiKey: string
}

export interface ISearchSettings {
    /** 当前搜索服务商 */
    provider: SearchProvider
    /** Tavily 配置 */
    tavily: {
        /** API Key */
        apiKey: string
    }
    /** Deepseek 配置 */
    deepseek: {
        /** API Key */
        apiKey: string
    }
}

/**
 * 获取当前搜索配置
 * @param search 搜索设置
 * @returns 未填写 API Key 时返回 null
 */
export function getSearchConfig(search: ISearchSettings): ISearchToolConfig | null {
    const apiKey = search.provider === 'tavily' ? search.tavily.apiKey : search.deepseek.apiKey
    if (!apiKey) return null

    return search.provider === 'tavily'
        ? { provider: 'tavily', apiKey }
        : { provider: 'deepseek', apiKey }
}
