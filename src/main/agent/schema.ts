import type { IAgentConfig } from './types'

import { z } from 'zod'

import { AgentReasoningEffortArray } from './types'

export const agentConfigSchema: z.ZodType<IAgentConfig> = z.object({
    provider: z.enum(['openai', 'deepseek', 'anthropic']),
    baseUrl: z.string().optional(),
    apiKey: z.string(),
    model: z.string(),
    apiFormat: z.enum(['chat', 'responses']).optional(),
    reasoningEffort: z.enum(AgentReasoningEffortArray).optional(),
    webSearch: z.boolean().optional()
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
        timeout: z.number().int().optional(),
        maxRetries: z.number().int().min(0).optional(),
        sessionId: z.string().optional(),
        source: z.string().optional(),
        skipLog: z.boolean().optional()
    }),
    z.object({
        config: agentConfigSchema,
        messages: z.array(agentMessageSchema).min(1),
        system: z.string().optional(),
        timeout: z.number().int().optional(),
        maxRetries: z.number().int().min(0).optional(),
        sessionId: z.string().optional(),
        source: z.string().optional(),
        skipLog: z.boolean().optional()
    })
])

export const aiLogListOptionsSchema = z.object({
    limit: z.number().int().min(1).max(100).default(30),
    offset: z.number().int().min(0).default(0),
    sources: z.array(z.string()).max(50).optional()
})
