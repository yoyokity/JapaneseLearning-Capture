/**
 * AI 提供商
 */
export type AgentProvider = 'openai' | 'deepseek' | 'anthropic'

/**
 * OpenAI 接口格式
 */
export type AgentApiFormat = 'chat' | 'responses'

/**
 * 思考强度选项，none 表示关闭思考
 */
export const AgentReasoningEffortArray = ['none', 'low', 'medium', 'high', 'max'] as const

/**
 * 思考强度
 */
export type AgentReasoningEffort = (typeof AgentReasoningEffortArray)[number]

/**
 * AI 结束原因
 */
export type AgentFinishReason =
    'stop' | 'length' | 'content-filter' | 'tool-calls' | 'error' | 'interrupted' | 'other'

/**
 * 判断是否为正常结束
 * @param reason 结束原因
 */
export function isAgentSuccess(reason: AgentFinishReason) {
    return reason === 'stop' || reason === 'other'
}

/**
 * AI 调用配置
 */
export interface IAgentConfig {
    /**
     * AI 提供商
     */
    provider: AgentProvider
    /**
     * OpenAI 兼容接口地址
     */
    baseUrl?: string | undefined
    /**
     * API Key
     */
    apiKey: string
    /**
     * 模型名称
     */
    model: string
    /**
     * OpenAI 接口格式，默认 responses
     */
    apiFormat?: AgentApiFormat | undefined
    /**
     * 思考强度，none 表示关闭思考
     */
    reasoningEffort?: AgentReasoningEffort | undefined
}

/**
 * 对话消息
 */
export type IAgentMessage =
    | {
          /**
           * 角色
           */
          role: 'user'
          /**
           * 文本内容
           */
          content: string
      }
    | {
          /**
           * 角色
           */
          role: 'assistant'
          /**
           * 文本内容
           */
          content: string
      }

/**
 * AI 调用公共参数
 */
export interface IAgentBaseOptions {
    /**
     * 连接配置
     */
    config: IAgentConfig
    /**
     * 系统提示词
     */
    system?: string | undefined
    /**
     * 超时时间（毫秒），流式调用中表示空闲超时
     */
    timeout?: number | undefined
}

/**
 * 单轮 AI 调用参数
 */
export interface IAgentCallOptions extends IAgentBaseOptions {
    /**
     * 用户输入
     */
    prompt: string
    /**
     * 取消信号
     */
    signal?: AbortSignal | undefined
}

/**
 * 多轮 AI 调用参数
 */
export interface IAgentChatOptions extends IAgentBaseOptions {
    /**
     * 历史消息
     */
    messages: IAgentMessage[]
}

/**
 * 流式调用参数，单轮或多轮二选一
 */
export type IAgentStreamOptions = Omit<IAgentCallOptions, 'signal'> | IAgentChatOptions

/**
 * AI 调用结果
 */
export interface IAgentResult {
    /**
     * 生成的文本
     */
    text: string
    /**
     * 推理文本
     */
    reasoningText?: string | undefined
    /**
     * 结束原因
     */
    finishReason: AgentFinishReason
    /**
     * 错误信息
     */
    error?: string | undefined
    /**
     * 是否被取消
     */
    cancelled?: boolean | undefined
}

/**
 * AI 流式数据块
 */
export interface IAgentDataPayload {
    type: 'data'
    /**
     * 生成的文本
     */
    data: string
    /**
     * 推理文本
     */
    reasoningData?: string | undefined
}

/**
 * AI 流式结束数据
 */
export interface IAgentEndPayload {
    type: 'end'
    /**
     * 完整文本
     */
    text: string
    /**
     * 完整推理文本
     */
    reasoningText?: string | undefined
    /**
     * 结束原因
     */
    finishReason: AgentFinishReason
}

/**
 * AI 流式重置数据，表示本轮输出作废，需要清空已展示内容
 */
export interface IAgentResetPayload {
    type: 'reset'
}

/**
 * AI 流式重试数据
 */
export interface IAgentRetryPayload {
    type: 'retry'
    /**
     * 重试层
     */
    layer: 'adapter' | 'recovery' | 'empty'
    /**
     * 当前层第几次重试
     */
    attempt: number
    /**
     * 当前层最大重试次数
     */
    maxAttempts: number
    /**
     * 等待时长（毫秒）
     */
    delayMs: number
}

/**
 * AI 流式响应
 */
export type IAgentStreamPayload =
    IAgentDataPayload | IAgentEndPayload | IAgentResetPayload | IAgentRetryPayload
