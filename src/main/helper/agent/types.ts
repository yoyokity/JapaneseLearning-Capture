import type { IAgentToolOptions } from './tools'

export type AgentProvider = 'openai' | 'deepseek' | 'anthropic'

export type AgentApiFormat = 'chat' | 'responses'

/** 思考强度选项 */
export const AgentReasoningEffortArray = ['none', 'low', 'medium', 'high', 'max'] as const

export type AgentReasoningEffort = (typeof AgentReasoningEffortArray)[number]

export type AgentFinishReason =
    'stop' | 'length' | 'content-filter' | 'tool-calls' | 'error' | 'interrupted' | 'other'

/** 重试原因 */
export type AgentRetryReason = 'request_failed' | 'stream_idle_timeout' | 'empty_completion'

export interface IAgentConfig {
    /** 提供商 */
    provider: AgentProvider
    /** 接口地址 */
    baseUrl?: string | undefined
    /** API Key */
    apiKey: string
    /** 模型名称 */
    model: string
    /** 接口格式，默认 responses */
    apiFormat?: AgentApiFormat | undefined
    /** 思考强度 */
    reasoningEffort?: AgentReasoningEffort | undefined
}

export interface IAgentMessage {
    /** 角色 */
    role: 'user' | 'assistant'
    /** 文本内容 */
    content: string
}

export interface IAgentBaseOptions {
    /** 连接配置 */
    config: IAgentConfig
    /** 系统提示词 */
    system?: string | undefined
    /** 超时时间（毫秒） */
    timeout?: number | undefined
    /** 最大重试次数（不含首次请求） */
    maxRetries?: number | undefined
}

export interface IAgentCallOptions extends IAgentBaseOptions {
    /** 用户输入 */
    prompt: string
    /** 取消信号 */
    signal?: AbortSignal | undefined
}

export interface IAgentChatOptions extends IAgentBaseOptions {
    /** 历史消息 */
    messages: IAgentMessage[]
}

export type IAgentStreamOptions =
    | (Omit<IAgentCallOptions, 'signal'> & IAgentToolOptions)
    | (IAgentChatOptions & IAgentToolOptions)

export interface IAgentResult {
    /** 生成的文本 */
    text: string
    /** 推理文本 */
    reasoningText?: string | undefined
    /** 结束原因 */
    finishReason: AgentFinishReason
    /** 错误信息 */
    error?: string | undefined
    /** 是否被取消 */
    cancelled?: boolean | undefined
}

export interface IAgentDataPayload {
    type: 'data'
    /** 生成的文本 */
    data: string
    /** 推理文本 */
    reasoningData?: string | undefined
}

export interface IAgentEndPayload {
    type: 'end'
    /** 完整文本 */
    text: string
    /** 完整推理文本 */
    reasoningText?: string | undefined
    /** 结束原因 */
    finishReason: AgentFinishReason
}

export interface IAgentResetPayload {
    type: 'reset'
}

export interface IAgentRetryPayload {
    type: 'retry'
    /** 重试层 */
    layer: 'adapter' | 'recovery' | 'empty'
    /** 当前重试次数 */
    attempt: number
    /** 最大重试次数 */
    maxAttempts: number
    /** 等待时长（毫秒） */
    delayMs: number
    /** 重试原因 */
    reason?: AgentRetryReason | undefined
    /** 错误状态码 */
    statusCode?: number | undefined
    /** 触发超时的时长（毫秒） */
    timeoutMs?: number | undefined
}

export type IAgentStreamPayload =
    IAgentDataPayload | IAgentEndPayload | IAgentResetPayload | IAgentRetryPayload

/**
 * 是否为正常结束
 * @param reason 结束原因
 */
export function isAgentSuccess(reason: AgentFinishReason) {
    return reason === 'stop'
}
