import type { ToolSet } from 'ai'

import { stepCountIs, tool } from 'ai'
import { z } from 'zod'

/** 默认工具循环最大步数 */
const AI_MAX_TOOL_STEPS = 5

export interface IAgentToolOptions {
    /** 工具集合，仅主进程内部使用 */
    tools?: ToolSet | undefined
    /** 单次调用内的工具循环最大步数 */
    maxSteps?: number | undefined
    /** 工具最大并发数 */
    toolCallConcurrency?: number | undefined
}

export interface IAgentToolState {
    /** 工具调用次数 */
    callCount: number
}

interface ICommitWord {
    /** 开始时间（毫秒） */
    from: number
    /** 结束时间（毫秒） */
    to: number
}

interface ICommitRange {
    /** 起始词索引 */
    fromWord: number
    /** 结束词索引 */
    toWord: number
    /** 译文 */
    zh: string
}

export interface ICommitToolOptions {
    /** 全部词 */
    words: ICommitWord[]
    /** 已覆盖词索引 */
    claimed: Set<number>
    /** 已提交范围 */
    ranges: ICommitRange[]
    /** 单行最大时长（毫秒） */
    maxCueMs: number
}

/**
 * 创建工具集合
 * @param options 提交工具参数
 */
export function createTools(options: ICommitToolOptions) {
    return { commit_subtitle: createCommitTool(options) }
}

/**
 * 创建提交字幕工具
 * @param options 工具参数
 * @remark 提交内容按全局词索引记录到 ranges，同时标记 claimed
 */
export function createCommitTool(options: ICommitToolOptions) {
    const { words, claimed, ranges, maxCueMs } = options

    return tool({
        description:
            '提交一条最终字幕。fromWord/toWord 是全局词索引（包含两端），必须完整覆盖所有词且不能重叠；zh 为简体中文译文，空字符串表示删除。',
        inputSchema: z.object({
            fromWord: z.number().int().min(0),
            toWord: z.number().int().min(0),
            zh: z.string()
        }),
        execute: ({ fromWord, toWord, zh }) => {
            if (fromWord < 0 || toWord >= words.length || fromWord > toWord) {
                return { ok: false, error: `词索引范围 ${fromWord}-${toWord} 无效` }
            }

            // execute 保持同步，保证并发调用下的覆盖检查是原子的
            for (let index = fromWord; index <= toWord; index++) {
                if (claimed.has(index)) {
                    return { ok: false, error: `词索引 ${index} 已被其他字幕覆盖` }
                }
            }

            const first = words[fromWord]
            const last = words[toWord]
            if (!first || !last) return { ok: false, error: '词索引不存在' }
            if (last.to - first.from > maxCueMs) {
                return { ok: false, error: `该范围超过 ${maxCueMs / 1000} 秒，请拆成多行` }
            }

            for (let index = fromWord; index <= toWord; index++) claimed.add(index)

            ranges.push({
                fromWord,
                toWord,
                zh: zh.replace(/\s+/g, ' ').trim()
            })

            return { ok: true, remaining: words.length - claimed.size }
        }
    })
}

/**
 * 构造工具调用配置
 * @param options 工具选项
 * @remark 未提供工具时返回空对象
 */
export function getToolOptions(options: IAgentToolOptions) {
    if (!options.tools) return {}

    return {
        tools: options.tools,
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
