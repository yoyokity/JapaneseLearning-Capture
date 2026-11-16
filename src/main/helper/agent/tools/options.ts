import type { ToolSet } from 'ai'

import { stepCountIs } from 'ai'

import { getDefaultFileTools } from './fileTools'

/** 默认工具循环最大步数 */
const AI_MAX_TOOL_STEPS = 5

export interface IAgentToolOptions {
    /** 工具集合，仅主进程内部使用；同名工具会覆盖默认工具 */
    tools?: ToolSet | undefined
    /** 默认文件工具的基准目录 */
    cwd?: string | undefined
    /** 单次调用内的工具循环最大步数 */
    maxSteps?: number | undefined
    /** 工具最大并发数 */
    toolCallConcurrency?: number | undefined
}

export interface IAgentToolState {
    /** 工具调用次数 */
    callCount: number
}

/**
 * 构造工具调用配置
 * @param options 工具选项
 * @remark 默认文件工具始终启用，传入的 tools 叠加在其后并覆盖同名工具
 */
export function getToolOptions(options: IAgentToolOptions) {
    const tools: ToolSet = {
        ...getDefaultFileTools(options.cwd),
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

/**
 * 处理工具流事件
 * @param part 流事件
 * @param part.type 事件类型
 * @param state 工具流状态
 * @returns 是否为工具事件
 * @remark 工具事件会暂停空闲计时并标记已产生输出
 */
export function handleToolPart(part: { type: string }, state: IAgentToolState) {
    if (part.type === 'tool-call') {
        state.callCount++
        return true
    }

    return part.type === 'tool-result' || part.type === 'tool-error'
}
