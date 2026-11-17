import type { IAgentConfig } from './types'

import { createAnthropic } from '@ai-sdk/anthropic'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { createOpenAI } from '@ai-sdk/openai'
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

    const provider = createOpenAI(options)

    return config.apiFormat === 'chat'
        ? provider.chat(config.model)
        : provider.responses(config.model)
}

/** 转换思考强度 */
export function getReasoningOption(config: IAgentConfig) {
    return config.reasoningEffort ? { reasoning: config.reasoningEffort } : {}
}
