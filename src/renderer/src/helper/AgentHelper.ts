import type { IAgentConfig, IAgentMessage, IAgentResult, IAgentRetryPayload } from '@shared'

import { ipc } from '@renderer/ipc'
import { isAgentSuccess } from '@shared'

import { LogHelper } from './LogHelper.ts'
import { TaskHelper } from './TaskHelper.ts'

/**
 * 流式回调
 */
export type TAgentStreamCallback = (data: string, reasoningData: string, reset?: boolean) => void

/**
 * 单轮 AI 调用参数
 */
export interface IAgentAskOptions {
    /**
     * 连接配置
     */
    config: IAgentConfig
    /**
     * 用户输入
     */
    prompt: string
    /**
     * 系统提示词
     */
    system?: string | undefined
    /**
     * 超时时间（毫秒）
     */
    timeout?: number | undefined
    /**
     * 流式回调
     */
    callback?: TAgentStreamCallback | undefined
    /**
     * 重试回调
     */
    onRetry?: ((info: IAgentRetryPayload) => void) | undefined
    /**
     * 取消信号
     */
    signal?: AbortSignal | undefined
}

/**
 * 多轮 AI 调用参数
 */
export interface IAgentChatOptions {
    /**
     * 连接配置
     */
    config: IAgentConfig
    /**
     * 历史消息
     */
    messages: IAgentMessage[]
    /**
     * 系统提示词
     */
    system?: string | undefined
    /**
     * 超时时间（毫秒）
     */
    timeout?: number | undefined
    /**
     * 流式回调
     */
    callback?: TAgentStreamCallback | undefined
    /**
     * 重试回调
     */
    onRetry?: ((info: IAgentRetryPayload) => void) | undefined
    /**
     * 取消信号
     */
    signal?: AbortSignal | undefined
}

/**
 * 多轮会话参数
 */
export interface IAgentSessionOptions {
    /**
     * 连接配置
     */
    config: IAgentConfig
    /**
     * 系统提示词
     */
    system?: string | undefined
    /**
     * 超时时间（毫秒）
     */
    timeout?: number | undefined
    /**
     * 重试回调
     */
    onRetry?: ((info: IAgentRetryPayload) => void) | undefined
}

/**
 * 请求入参
 */
type TAgentRequestInput =
    | {
          config: IAgentConfig
          prompt: string
          system?: string | undefined
          timeout?: number | undefined
          signal?: AbortSignal | undefined
      }
    | {
          config: IAgentConfig
          messages: IAgentMessage[]
          system?: string | undefined
          timeout?: number | undefined
          signal?: AbortSignal | undefined
      }

/**
 * 获取重试提示文案
 * @param info 重试信息
 */
export function getRetryMessage(info: IAgentRetryPayload) {
    if (info.layer === 'recovery') {
        return `AI 输出中断，正在重新生成 ${info.attempt}/${info.maxAttempts}`
    }

    if (info.layer === 'empty') {
        return 'AI 返回空响应，正在重试'
    }

    return `AI 请求失败，正在重试 ${info.attempt}/${info.maxAttempts}`
}

/**
 * 提取错误信息
 * @param error 错误对象
 */
function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error)
}

/**
 * 多轮 AI 会话
 */
export class AgentSession {
    private readonly options: IAgentSessionOptions
    private readonly history: IAgentMessage[] = []
    private activeController: AbortController | null = null
    private generation = 0

    constructor(options: IAgentSessionOptions) {
        this.options = options
    }

    /**
     * 当前对话历史
     */
    get messages(): IAgentMessage[] {
        return this.history.map((message) => ({ ...message }))
    }

    /**
     * 发送一条消息并等待回复
     * @param text 用户输入
     * @param callback 流式回调
     */
    async send(text: string, callback?: TAgentStreamCallback): Promise<IAgentResult> {
        if (this.activeController) {
            throw new Error('上一轮对话尚未结束')
        }

        const controller = new AbortController()
        const generation = this.generation
        this.activeController = controller
        this.history.push({ role: 'user', content: text })

        try {
            const result = await AgentHelper.chat({
                config: this.options.config,
                messages: [...this.history],
                system: this.options.system,
                timeout: this.options.timeout,
                signal: controller.signal,
                callback,
                onRetry: this.options.onRetry
            })

            // 会话已被 clear() 清空时，不再写回旧历史
            if (generation === this.generation) {
                if (isAgentSuccess(result.finishReason) && result.text.trim()) {
                    this.history.push({ role: 'assistant', content: result.text })
                } else {
                    this.history.pop()
                }
            }

            return result
        } finally {
            if (this.activeController === controller) {
                this.activeController = null
            }
        }
    }

    /**
     * 取消当前请求
     */
    abort() {
        this.activeController?.abort()
    }

    /**
     * 清空对话历史
     */
    clear() {
        this.abort()
        this.generation += 1
        this.history.length = 0
    }
}

/**
 * AI 调用
 */
export class AgentHelper {
    /**
     * 创建多轮会话
     * @param options 会话参数
     */
    static createSession(options: IAgentSessionOptions) {
        return new AgentSession(options)
    }

    /**
     * 单轮流式 AI 请求
     * @param options AI 调用参数
     */
    static async ask(options: IAgentAskOptions): Promise<IAgentResult> {
        return AgentHelper.request(
            {
                config: options.config,
                prompt: options.prompt,
                system: options.system,
                timeout: options.timeout,
                signal: options.signal
            },
            options.callback,
            options.onRetry
        )
    }

    /**
     * 多轮流式 AI 请求
     * @param options AI 调用参数
     */
    static async chat(options: IAgentChatOptions): Promise<IAgentResult> {
        return AgentHelper.request(
            {
                config: options.config,
                // 复制一份，避免调用方后续修改影响请求
                messages: options.messages.map((message) => ({ ...message })),
                system: options.system,
                timeout: options.timeout,
                signal: options.signal
            },
            options.callback,
            options.onRetry
        )
    }

    /**
     * 发起流式请求
     * @param input 请求入参
     * @param callback 流式回调
     * @param onRetry 重试回调
     */
    private static async request(
        input: TAgentRequestInput,
        callback?: TAgentStreamCallback,
        onRetry?: (info: IAgentRetryPayload) => void
    ): Promise<IAgentResult> {
        if (input.signal?.aborted) {
            return { text: '', finishReason: 'error', cancelled: true }
        }

        const timeout = input.timeout

        const re = await TaskHelper.tryExecute(async () => {
            let closed = false
            let isResolved = false
            let text = ''
            let reasoningText = ''

            let resolveTask!: (value: IAgentResult) => void
            let rejectTask!: (reason?: any) => void

            const completed = new Promise<IAgentResult>((resolve, reject) => {
                resolveTask = resolve
                rejectTask = reject
            })

            const body =
                'messages' in input
                    ? {
                          config: input.config,
                          messages: input.messages,
                          system: input.system,
                          timeout
                      }
                    : {
                          config: input.config,
                          prompt: input.prompt,
                          system: input.system,
                          timeout
                      }

            const subscription = ipc.agent.stream.subscribe(body, {
                onData(payload) {
                    if (payload.type === 'retry') {
                        onRetry?.(payload)
                        return
                    }

                    if (payload.type === 'reset') {
                        text = ''
                        reasoningText = ''
                        callback?.('', '', true)
                        return
                    }

                    if (payload.type === 'data') {
                        text += payload.data
                        reasoningText += payload.reasoningData ?? ''
                        callback?.(payload.data, payload.reasoningData ?? '')
                        return
                    }

                    text = payload.text
                    reasoningText = payload.reasoningText ?? reasoningText
                    if (isResolved) return

                    isResolved = true
                    resolveTask({
                        text,
                        ...(reasoningText ? { reasoningText } : {}),
                        finishReason: payload.finishReason
                    })
                },
                onError(error) {
                    if (closed) return

                    closed = true
                    rejectTask(error)
                },
                onComplete() {
                    if (closed) return

                    closed = true
                    if (isResolved) {
                        return
                    }

                    isResolved = true
                    resolveTask({
                        text,
                        ...(reasoningText ? { reasoningText } : {}),
                        finishReason: 'error',
                        error: 'AI流未正常结束'
                    })
                }
            })

            /**
             * 取消当前请求
             */
            function cancel() {
                if (closed) return

                closed = true
                subscription.unsubscribe()
                callback?.('', '', true)
                rejectTask(new Error('AI流已取消'))
            }

            if (input.signal?.aborted) {
                cancel()
            } else {
                input.signal?.addEventListener('abort', cancel, { once: true })
            }

            return {
                completed,
                dispose: () => input.signal?.removeEventListener('abort', cancel)
            }
        })

        if (re.hasError) {
            if (input.signal?.aborted) {
                return { text: '', finishReason: 'error', cancelled: true }
            }

            LogHelper.error(
                `AI流请求失败：${input.config.provider}:${input.config.model}`,
                re.error
            )
            return { text: '', finishReason: 'error', error: getErrorMessage(re.error) }
        }

        try {
            return await re.result.completed
        } catch (error) {
            if (input.signal?.aborted) {
                return { text: '', finishReason: 'error', cancelled: true }
            }

            LogHelper.error(`AI流请求失败：${input.config.provider}:${input.config.model}`, error)
            return { text: '', finishReason: 'error', error: getErrorMessage(error) }
        } finally {
            re.result.dispose()
        }
    }
}
