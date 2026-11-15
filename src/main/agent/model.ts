import type { IAgentConfig } from './types'

import { createAnthropic } from '@ai-sdk/anthropic'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { createOpenAI } from '@ai-sdk/openai'
import { net } from 'electron'

/**
 * 适配 AI SDK 要求的 fetch 签名
 * @param input 请求地址
 * @param init 请求配置
 */
function aiFetch(input: RequestInfo | URL, init?: RequestInit) {
    const requestInput = input instanceof URL ? input.toString() : input
    return net.fetch(requestInput, init)
}

/**
 * 获取 AI 模型实例
 * @param config AI 调用配置
 */
export function getAgentModel(config: IAgentConfig) {
    if (config.provider === 'deepseek') {
        const provider = createDeepSeek({
            apiKey: config.apiKey,
            fetch: aiFetch,
            ...(config.baseUrl ? { baseURL: config.baseUrl } : {})
        })

        return provider(config.model)
    }

    if (config.provider === 'anthropic') {
        const provider = createAnthropic({
            apiKey: config.apiKey,
            fetch: aiFetch,
            ...(config.baseUrl ? { baseURL: config.baseUrl } : {})
        })

        return provider(config.model)
    }

    const provider = createOpenAI({
        apiKey: config.apiKey,
        fetch: aiFetch,
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {})
    })

    return config.apiFormat === 'chat'
        ? provider.chat(config.model)
        : provider.responses(config.model)
}

/**
 * 转换思考强度
 * @param config AI 调用配置
 */
export function getReasoningOption(config: IAgentConfig) {
    return config.reasoningEffort ? { reasoning: config.reasoningEffort } : {}
}
