import type { IAgentConfig } from './types'

import { z } from 'zod'

import { AgentReasoningEffortArray } from './types'

/**
 * AI 调用配置结构
 */
export const agentConfigSchema: z.ZodType<IAgentConfig> = z.object({
    provider: z.enum(['openai', 'deepseek', 'anthropic']),
    baseUrl: z.string().optional(),
    apiKey: z.string(),
    model: z.string(),
    apiFormat: z.enum(['chat', 'responses']).optional(),
    reasoningEffort: z.enum(AgentReasoningEffortArray).optional()
})

/**
 * 对话消息结构
 */
export const agentMessageSchema = z.discriminatedUnion('role', [
    z.object({
        role: z.literal('user'),
        content: z.string()
    }),
    z.object({
        role: z.literal('assistant'),
        content: z.string()
    })
])

/**
 * AI 流式调用参数结构
 */
export const agentStreamOptionsSchema = z.union([
    z.object({
        config: agentConfigSchema,
        prompt: z.string(),
        system: z.string().optional(),
        timeout: z.number().int().optional()
    }),
    z.object({
        config: agentConfigSchema,
        messages: z.array(agentMessageSchema).min(1),
        system: z.string().optional(),
        timeout: z.number().int().optional()
    })
])
