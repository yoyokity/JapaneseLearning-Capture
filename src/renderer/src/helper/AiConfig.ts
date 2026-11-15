import type { IAgentConfig } from '@shared'

/**
 * 模型服务商选项
 */
export const AiProviderOptions = [
    { label: 'OpenAI', value: 'openai' },
    { label: 'Deepseek', value: 'deepseek' },
    { label: '自定义', value: 'custom' }
] as const

/**
 * 模型服务商
 */
export type AiProvider = (typeof AiProviderOptions)[number]['value']

/**
 * 模型服务商描述
 */
export const AiProviderDescriptions: Record<AiProvider, string> = {
    openai: '使用 OpenAI 官方接口',
    deepseek: '使用 DeepSeek 官方接口',
    custom: '兼容 OpenAI / Anthropic 格式的第三方接口或代理'
}

/**
 * API 格式选项
 */
export const AiApiFormatOptions = [
    { label: 'Anthropic Messages (/v1/messages)', value: 'anthropic' },
    { label: 'Chat Completions (/chat/completions)', value: 'chat' },
    { label: 'Responses (/responses)', value: 'responses' }
] as const

/**
 * API 格式
 */
export type AiApiFormat = (typeof AiApiFormatOptions)[number]['value']

/**
 * OpenAI / 自定义服务的思考强度
 */
export const OpenAIReasoningEffortArray = ['none', 'low', 'high', 'max'] as const

/**
 * DeepSeek 的思考强度
 */
export const DeepseekReasoningEffortArray = ['none', 'high', 'max'] as const

/**
 * AI 模型配置
 */
export interface IAiSettings {
    /**
     * 当前模型服务商
     */
    provider: AiProvider
    /**
     * OpenAI 配置
     */
    openai: {
        /**
         * API Key
         */
        apiKey: string
        /**
         * 模型名称
         */
        model: string
        /**
         * 思考强度
         */
        reasoningEffort: (typeof OpenAIReasoningEffortArray)[number]
    }
    /**
     * DeepSeek 配置
     */
    deepseek: {
        /**
         * API Key
         */
        apiKey: string
        /**
         * 模型名称
         */
        model: string
        /**
         * 思考强度
         */
        reasoningEffort: (typeof DeepseekReasoningEffortArray)[number]
    }
    /**
     * 自定义服务配置
     */
    custom: {
        /**
         * OpenAI 兼容接口地址
         */
        baseUrl: string
        /**
         * API Key，可为空
         */
        apiKey: string
        /**
         * 接口格式
         */
        apiFormat: AiApiFormat
        /**
         * 模型名称
         */
        model: string
        /**
         * 思考强度
         */
        reasoningEffort: (typeof OpenAIReasoningEffortArray)[number]
    }
}

/**
 * 获取当前服务商的 agent 调用配置
 * @param ai AI 模型配置
 * @returns 必填项不完整时返回 null
 */
export function getAgentConfig(ai: IAiSettings): IAgentConfig | null {
    if (ai.provider === 'openai') {
        if (!ai.openai.apiKey || !ai.openai.model) return null

        return {
            provider: 'openai',
            apiKey: ai.openai.apiKey,
            model: ai.openai.model,
            reasoningEffort: ai.openai.reasoningEffort
        }
    }

    if (ai.provider === 'deepseek') {
        if (!ai.deepseek.apiKey || !ai.deepseek.model) return null

        return {
            provider: 'deepseek',
            apiKey: ai.deepseek.apiKey,
            model: ai.deepseek.model,
            reasoningEffort: ai.deepseek.reasoningEffort
        }
    }

    if (!ai.custom.baseUrl || !ai.custom.model) return null

    // 统一成 SDK 追加接口路径前的前缀
    let baseUrl = ai.custom.baseUrl.replace(/\/+$/, '')

    for (const endpoint of ['/chat/completions', '/responses', '/messages']) {
        if (baseUrl.endsWith(endpoint)) {
            baseUrl = baseUrl.slice(0, -endpoint.length)
            break
        }
    }

    // Anthropic 官方接口固定带 /v1 前缀
    if (ai.custom.apiFormat === 'anthropic' && !/\/v\d+$/.test(baseUrl)) {
        baseUrl = `${baseUrl}/v1`
    }

    const baseConfig = {
        baseUrl,
        apiKey: ai.custom.apiKey || '1',
        model: ai.custom.model,
        // 自定义服务通常是第三方接口，none 时不发送思考参数
        ...(ai.custom.reasoningEffort === 'none'
            ? {}
            : { reasoningEffort: ai.custom.reasoningEffort })
    }

    if (ai.custom.apiFormat === 'anthropic') {
        return {
            provider: 'anthropic',
            ...baseConfig
        }
    }

    return {
        provider: 'openai',
        apiFormat: ai.custom.apiFormat,
        ...baseConfig
    }
}
