import type { ToolSet } from 'ai'
import type { ISearchEngineConfig } from '../../services/search'
import type { IReadFileState } from './readFile'

import { stepCountIs } from 'ai'

import { createEditFileTool } from './editFile'
import { createWebFetchTool } from './fetch'
import { createReadFileTool } from './readFile'
import { createWebSearchTool } from './search'

/** 默认工具循环最大步数 */
const AI_MAX_TOOL_STEPS = 5

export interface IAgentToolOptions {
    /** 自定义工具集合 */
    tools?: ToolSet | undefined
    /** 工具循环最大步数 */
    maxSteps?: number | undefined
    /** 工具最大并发数 */
    toolCallConcurrency?: number | undefined
    /** 联网搜索配置，提供 apiKey 时才会注册搜索工具 */
    search?: ISearchEngineConfig | undefined
}

export interface IAgentToolState {
    /** 工具调用次数 */
    callCount: number
}

/** 构造工具调用配置 */
export function getToolOptions(options: IAgentToolOptions) {
    // 文件工具共享读取状态
    const readFileState = new Map<string, IReadFileState>()
    const tools: ToolSet = {
        read_file: createReadFileTool({ readFileState }),
        edit_file: createEditFileTool({ readFileState }),
        ...(options.search?.apiKey
            ? {
                  web_search: createWebSearchTool({ config: options.search }),
                  web_fetch: createWebFetchTool({ config: options.search })
              }
            : {}),
        ...options.tools
    }

    return {
        tools,
        stopWhen: stepCountIs(options.maxSteps ?? AI_MAX_TOOL_STEPS),
        ...(options.toolCallConcurrency != null
            ? { toolCallConcurrency: options.toolCallConcurrency }
            : {})
    }
}

/** 处理工具流事件 */
export function handleToolPart(part: { type: string }, state: IAgentToolState) {
    if (part.type === 'tool-call') {
        state.callCount++
        return true
    }

    return part.type === 'tool-result' || part.type === 'tool-error'
}
