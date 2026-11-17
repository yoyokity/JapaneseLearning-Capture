import type { IAiLogAttemptItem, IAiLogSessionDetail, IAiLogStepItem } from '@shared'
import type { IToolItem } from './tool'

/** 内容 part */
interface IContentPart {
    type: string
    text?: string | undefined
    toolCallId?: string | undefined
    toolName?: string | undefined
    input?: unknown
    output?: unknown
    error?: unknown
}

/** 工具结果 */
interface IToolResultLike {
    toolCallId?: string | undefined
    toolName?: string | undefined
    output?: unknown
}

/** 时间线片段 */
interface IStepPart {
    type: 'reasoning' | 'text' | 'tool'
    key: string
    text?: string | undefined
    name?: string | undefined
    input?: unknown
    output?: unknown
    error?: unknown
}

/** 工作区行 */
export interface IWorkRow {
    kind: 'attempt' | 'reasoning' | 'text' | 'tool' | 'toolGroup' | 'error'
    key: string
    text: string
    attempt: IAiLogAttemptItem | null
    tool: IToolItem | null
    tools: IToolItem[]
}

/**
 * 提取用户消息
 * @param input 会话输入
 */
export function getUserMessages(input: unknown) {
    if (!input || typeof input !== 'object') return []

    const item = input as { prompt?: unknown; messages?: unknown }
    if (typeof item.prompt === 'string') return [item.prompt]
    if (!Array.isArray(item.messages)) return []

    const messages: string[] = []
    for (const message of item.messages) {
        if (!message || typeof message !== 'object') continue

        const record = message as { role?: unknown; content?: unknown }
        if (record.role === 'user' && typeof record.content === 'string') {
            messages.push(record.content)
        }
    }

    return messages
}

/**
 * 解析步骤为时间线片段
 * @param step 步骤
 * @remark 优先按 content 原始顺序渲染，缺失时回退到 text/toolCalls 字段
 */
function getStepParts(step: IAiLogStepItem) {
    const parts: IStepPart[] = []
    const content = Array.isArray(step.content) ? (step.content as IContentPart[]) : []

    const results = new Map<string, { output: unknown; error: unknown }>()
    for (const item of content) {
        if (item.type === 'tool-result' && item.toolCallId) {
            results.set(item.toolCallId, { output: item.output, error: null })
        } else if (item.type === 'tool-error' && item.toolCallId) {
            results.set(item.toolCallId, { output: null, error: item.error })
        }
    }
    if (Array.isArray(step.toolResults)) {
        for (const item of step.toolResults as IToolResultLike[]) {
            if (item.toolCallId && !results.has(item.toolCallId)) {
                results.set(item.toolCallId, { output: item.output, error: null })
            }
        }
    }

    let hasReasoning = false
    let hasText = false
    for (const item of content) {
        if (item.type === 'reasoning' && item.text?.trim()) {
            hasReasoning = true
            parts.push({
                type: 'reasoning',
                key: `${step.id}-reasoning-${parts.length}`,
                text: item.text
            })
        } else if (item.type === 'text' && item.text?.trim()) {
            hasText = true
            parts.push({ type: 'text', key: `${step.id}-text-${parts.length}`, text: item.text })
        } else if (item.type === 'tool-call' && item.toolCallId) {
            const result = results.get(item.toolCallId)
            parts.push({
                type: 'tool',
                key: item.toolCallId,
                name: item.toolName ?? 'tool',
                input: item.input,
                output: result?.output ?? null,
                error: result?.error ?? null
            })
        }
    }

    // content 未包含对应内容时用 step 字段补齐
    if (!hasReasoning && step.reasoningText?.trim()) {
        parts.unshift({
            type: 'reasoning',
            key: `${step.id}-reasoning`,
            text: step.reasoningText
        })
    }
    if (!hasText && step.text?.trim()) {
        parts.push({ type: 'text', key: `${step.id}-text`, text: step.text })
    }

    if (!parts.some((part) => part.type === 'tool') && Array.isArray(step.toolCalls)) {
        const fallbackResults = new Map<string, unknown>()
        if (Array.isArray(step.toolResults)) {
            for (const item of step.toolResults as IToolResultLike[]) {
                if (item.toolCallId) fallbackResults.set(item.toolCallId, item.output)
            }
        }

        for (const item of step.toolCalls as IContentPart[]) {
            if (!item.toolCallId) continue

            parts.push({
                type: 'tool',
                key: item.toolCallId,
                name: item.toolName ?? 'tool',
                input: item.input,
                output: fallbackResults.get(item.toolCallId) ?? null,
                error: null
            })
        }
    }

    return parts
}

/**
 * 创建空白工作行
 * @param kind 行类型
 * @param key 行标识
 * @param values 行内容
 * @param values.text 文本内容
 * @param values.attempt 尝试信息
 * @param values.tool 工具信息
 * @param values.tools 工具列表
 */
function createWorkRow(
    kind: IWorkRow['kind'],
    key: string,
    values?: {
        text?: string
        attempt?: IAiLogAttemptItem
        tool?: IToolItem
        tools?: IToolItem[]
    }
): IWorkRow {
    return {
        kind,
        key,
        text: values?.text ?? '',
        attempt: values?.attempt ?? null,
        tool: values?.tool ?? null,
        tools: values?.tools ?? []
    }
}

/**
 * 合并连续的工具调用
 * @param rows 工作行
 */
function groupToolRows(rows: IWorkRow[]) {
    const result: IWorkRow[] = []
    let tools: IToolItem[] = []

    const flush = () => {
        const [first] = tools
        if (!first) return

        if (tools.length === 1) {
            result.push(createWorkRow('tool', `tool-${first.key}`, { tool: first }))
        } else {
            result.push(createWorkRow('toolGroup', `group-${first.key}`, { tools }))
        }
        tools = []
    }

    for (const row of rows) {
        if (row.kind === 'tool' && row.tool) {
            tools.push(row.tool)
        } else {
            flush()
            result.push(row)
        }
    }
    flush()

    return result
}

/**
 * 获取指定尝试的步骤
 * @param steps 步骤列表
 * @param attemptNo 尝试序号
 */
function stepsForAttempt(steps: IAiLogStepItem[], attemptNo: number) {
    return steps.filter((step) => step.attemptNo === attemptNo)
}

/**
 * 构建会话工作区
 * @param detail 会话详情
 * @param steps 会话步骤
 * @remark 最后一个文本片段作为最终回复移到工作区外
 */
export function buildSessionView(detail: IAiLogSessionDetail, steps: IAiLogStepItem[]) {
    const rows: IWorkRow[] = []
    let finalRow: IWorkRow | null = null

    for (const attempt of detail.attempts) {
        if (detail.attempts.length > 1) {
            rows.push(createWorkRow('attempt', `attempt-${attempt.id}`, { attempt }))
        }

        const attemptRows: IWorkRow[] = []
        for (const step of stepsForAttempt(steps, attempt.attemptNo)) {
            for (const part of getStepParts(step)) {
                if (part.type === 'reasoning') {
                    attemptRows.push(
                        createWorkRow('reasoning', part.key, { text: part.text ?? '' })
                    )
                } else if (part.type === 'text') {
                    const row = createWorkRow('text', part.key, { text: part.text ?? '' })
                    attemptRows.push(row)
                    finalRow = row
                } else {
                    attemptRows.push(
                        createWorkRow('tool', part.key, {
                            tool: {
                                key: part.key,
                                name: part.name ?? 'tool',
                                input: part.input,
                                output: part.output,
                                error: part.error
                            }
                        })
                    )
                }
            }
        }

        rows.push(...groupToolRows(attemptRows))

        if (attempt.error && attempt.error !== detail.session.error) {
            rows.push(createWorkRow('error', `error-${attempt.id}`, { text: attempt.error }))
        }
    }

    let finalText = ''
    if (finalRow) {
        finalText = finalRow.text
        const index = rows.indexOf(finalRow)
        if (index >= 0) rows.splice(index, 1)
    }
    if (!finalText) finalText = detail.session.text ?? ''

    return { rows, finalText }
}
