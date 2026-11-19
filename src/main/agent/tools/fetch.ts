import type { ISearchEngineConfig } from '../../services/search'

import { tool } from 'ai'
import { z } from 'zod'

import { createSearchEngine } from '../../services/search'

/** 单页内容最大字符数 */
const MAX_CONTENT_LENGTH = 50_000
/** 网页地址协议 */
const PAGE_PROTOCOL_PATTERN = /^https?$/

/**
 * 网页抓取工具配置
 */
export interface IWebFetchToolOptions {
    /** 搜索引擎配置 */
    config: ISearchEngineConfig
}

/**
 * 网页抓取工具输入
 */
interface IWebFetchInput {
    url: string
}

/**
 * 网页抓取工具输出
 */
interface IWebFetchOutput {
    results: {
        title?: string | undefined
        url: string
        content: string
    }[]
    failedResults: {
        url: string
        error: string
    }[]
}

/**
 * 创建网页抓取工具
 * @param options 工具配置
 */
export function createWebFetchTool(options: IWebFetchToolOptions) {
    const engine = createSearchEngine(options.config)

    return tool<IWebFetchInput, IWebFetchOutput, Record<string, unknown>>({
        description: [
            '抓取网页的完整内容，返回 Markdown 文本。',
            '',
            '在 web_search 之后需要阅读某条结果的全文时使用，或用户直接提供了 URL 时使用。',
            '每次调用只支持一个 URL。'
        ].join('\n'),
        inputSchema: z.object({
            url: z.url({ protocol: PAGE_PROTOCOL_PATTERN }).describe('要抓取的 HTTP 或 HTTPS URL')
        }),
        execute: async ({ url }): Promise<IWebFetchOutput> => {
            const response = await engine.fetchPage(url)

            return {
                results: response.results.map((item) => ({
                    ...(item.title ? { title: item.title } : {}),
                    url: item.url,
                    content:
                        item.content.length > MAX_CONTENT_LENGTH
                            ? `${item.content.slice(0, MAX_CONTENT_LENGTH)}\n\n[内容已截断]`
                            : item.content
                })),
                failedResults: response.failedResults
            }
        }
    })
}
