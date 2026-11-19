import type { ISearchEngineConfig } from '../../services/search'

import { tool } from 'ai'
import { z } from 'zod'

import { createSearchEngine } from '../../services/search'

/** 单次搜索最大返回条数 */
const MAX_RESULTS = 10
/** 默认返回条数 */
const DEFAULT_RESULTS = 5

/**
 * 联网搜索工具配置
 */
export interface IWebSearchToolOptions {
    /** 搜索引擎配置 */
    config: ISearchEngineConfig
}

/**
 * 联网搜索工具输入
 */
interface IWebSearchInput {
    query: string
    maxResults?: number | undefined
    includeDomains?: string[] | undefined
    excludeDomains?: string[] | undefined
    timeRange?: 'day' | 'week' | 'month' | 'year' | undefined
}

/**
 * 联网搜索工具输出
 */
interface IWebSearchOutput {
    query: string
    answer?: string
    results: {
        title: string
        url: string
        content: string
        publishedDate?: string
    }[]
}

/**
 * 创建联网搜索工具
 * @param options 工具配置
 */
export function createWebSearchTool(options: IWebSearchToolOptions) {
    const engine = createSearchEngine(options.config)

    return tool<IWebSearchInput, IWebSearchOutput, Record<string, unknown>>({
        description: [
            '搜索互联网以获取实时信息。',
            '',
            '当回答依赖近期事件、当前数据或当前上下文中缺失的事实时使用。',
            '返回按相关度排序的结果，包含标题、URL 和内容摘要。',
            `默认返回 ${DEFAULT_RESULTS} 条结果，最多 ${MAX_RESULTS} 条。`
        ].join('\n'),
        inputSchema: z.object({
            query: z.string().describe('搜索关键词'),
            maxResults: z
                .number()
                .int()
                .min(1)
                .max(MAX_RESULTS)
                .optional()
                .describe(`返回结果数量，默认 ${DEFAULT_RESULTS}`),
            includeDomains: z.array(z.string()).optional().describe('只搜索这些域名'),
            excludeDomains: z.array(z.string()).optional().describe('排除这些域名'),
            timeRange: z
                .enum(['day', 'week', 'month', 'year'])
                .optional()
                .describe('限制结果的时间范围')
        }),
        execute: async ({
            query,
            maxResults,
            includeDomains,
            excludeDomains,
            timeRange
        }): Promise<IWebSearchOutput> => {
            const response = await engine.search({
                query,
                maxResults: maxResults ?? DEFAULT_RESULTS,
                ...(includeDomains?.length ? { includeDomains } : {}),
                ...(excludeDomains?.length ? { excludeDomains } : {}),
                ...(timeRange ? { timeRange } : {})
            })

            return {
                query: response.query,
                ...(response.answer ? { answer: response.answer } : {}),
                results: response.results.map((item) => ({
                    title: item.title,
                    url: item.url,
                    content: item.content,
                    ...(item.publishedDate ? { publishedDate: item.publishedDate } : {})
                }))
            }
        }
    })
}
