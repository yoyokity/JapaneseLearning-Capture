import type { IAgentConfig } from './types'

import { z } from 'zod'

import { AgentReasoningEffortArray } from './types'

export const agentConfigSchema: z.ZodType<IAgentConfig> = z.object({
    provider: z.enum(['openai', 'deepseek', 'anthropic']),
    baseUrl: z.string().optional(),
    apiKey: z.string(),
    model: z.string(),
    apiFormat: z.enum(['chat', 'responses']).optional(),
    reasoningEffort: z.enum(AgentReasoningEffortArray).optional()
})

export const agentMessageSchema = z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string()
})

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
