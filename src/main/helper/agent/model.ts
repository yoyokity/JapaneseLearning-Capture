import type { IAgentConfig } from './types'

import { createAnthropic } from '@ai-sdk/anthropic'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { net } from 'electron'

/** 适配 AI SDK 的 fetch */
function aiFetch(input: RequestInfo | URL, init?: RequestInit) {
    return net.fetch(input instanceof URL ? input.toString() : input, init)
}

/** 获取模型实例 */
export function getAgentModel(config: IAgentConfig) {
    const options = {
        apiKey: config.apiKey,
        fetch: aiFetch,
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {})
    }

    if (config.provider === 'deepseek') {
        return createDeepSeek(options)(config.model)
    }

    if (config.provider === 'anthropic') {
        return createAnthropic(options)(config.model)
    }

    // 自定义接口的 chat 格式需要解析 reasoning_content，使用通用兼容实现
    if (config.apiFormat === 'chat') {
        return createOpenAICompatible({
            name: 'custom',
            baseURL: config.baseUrl ?? 'https://api.openai.com/v1',
            apiKey: config.apiKey,
            fetch: aiFetch
        })(config.model)
    }

    return createOpenAI(options).responses(config.model)
}

/** 转换思考强度 */
export function getReasoningOption(config: IAgentConfig) {
    return config.reasoningEffort ? { reasoning: config.reasoningEffort } : {}
}
