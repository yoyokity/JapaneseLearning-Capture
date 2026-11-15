import type { IAgentConfig, IAgentMessage, IAgentResult, IAgentRetryPayload } from '@shared'

import { ipc } from '@renderer/ipc'
import { isAgentSuccess } from '@shared'

import { LogHelper } from '../LogHelper.ts'
import { TaskHelper } from '../TaskHelper.ts'

/** 会话上下文上限（token） */
const SESSION_MAX_TOKENS = 1_000_000

export type TAgentStreamCallback = (data: string, reasoningData: string, reset?: boolean) => void

export interface IAgentAskOptions {
    /** 连接配置 */
    config: IAgentConfig
    /** 用户输入 */
    prompt: string
    /** 系统提示词 */
    system?: string | undefined
    /** 超时时间（毫秒） */
    timeout?: number | undefined
    /** 流式回调 */
    callback?: TAgentStreamCallback | undefined
    /** 重试回调 */
    onRetry?: ((info: IAgentRetryPayload) => void) | undefined
    /** 取消信号 */
    signal?: AbortSignal | undefined
}

export interface IAgentChatOptions {
    /** 连接配置 */
    config: IAgentConfig
    /** 历史消息 */
    messages: IAgentMessage[]
    /** 系统提示词 */
    system?: string | undefined
    /** 超时时间（毫秒） */
    timeout?: number | undefined
    /** 流式回调 */
    callback?: TAgentStreamCallback | undefined
    /** 重试回调 */
    onRetry?: ((info: IAgentRetryPayload) => void) | undefined
    /** 取消信号 */
    signal?: AbortSignal | undefined
}

export interface IAgentSessionOptions {
    /** 连接配置 */
    config: IAgentConfig
    /** 系统提示词 */
    system?: string | undefined
    /** 超时时间（毫秒） */
    timeout?: number | undefined
    /** 重试回调 */
    onRetry?: ((info: IAgentRetryPayload) => void) | undefined
}

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
 * 估算 token 数
 * @param text 文本
 * @description 中日韩字符按 1 token，其余按 4 字符
 */
function estimateTokens(text: string) {
    let cjk = 0
    let other = 0

    for (let index = 0; index < text.length; index++) {
        const code = text.charCodeAt(index)

        if (
            (code >= 0x3000 && code <= 0x9fff) ||
            (code >= 0xf900 && code <= 0xfaff) ||
            (code >= 0xac00 && code <= 0xd7af)
        ) {
            cjk++
        } else {
            other++
        }
    }

    return cjk + Math.ceil(other / 4)
}

/**
 * 裁剪会话历史
 * @param history 会话历史，原地修改
 */
function trimSessionHistory(history: IAgentMessage[]) {
    let total = 0
    let start = history.length

    while (start > 0) {
        const message = history[start - 1]
        const cost = estimateTokens(message.content) + 4

        // 最后一条即使超限也保留
        if (total + cost > SESSION_MAX_TOKENS && start < history.length) break

        total += cost
        start--
    }

    // 不能以 assistant 开头
    while (start < history.length && history[start].role === 'assistant') {
        start++
    }

    // 至少保留最后一条
    const keepFrom = Math.min(start, history.length - 1)
    if (keepFrom > 0) {
        history.splice(0, keepFrom)
    }
}

export class AgentSession {
    private readonly options: IAgentSessionOptions
    private readonly history: IAgentMessage[] = []
    private activeController: AbortController | null = null
    private generation = 0
    private queue: Promise<void> = Promise.resolve()

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
     * 发送消息并等待回复
     * @param text 用户输入
     * @param callback 流式回调
     * @description 消息按调用顺序排队
     */
    async send(text: string, callback?: TAgentStreamCallback): Promise<IAgentResult> {
        const epoch = this.generation

        const task = this.queue.then((): IAgentResult | Promise<IAgentResult> => {
            // abort()/clear() 后不再执行
            if (epoch !== this.generation) {
                return { text: '', finishReason: 'error', cancelled: true }
            }

            return this.doSend(text, callback)
        })

        // 让后续消息继续排队
        this.queue = task.then(
            () => undefined,
            () => undefined
        )

        return task
    }

    /**
     * 执行一次发送
     * @param text 用户输入
     * @param callback 流式回调
     */
    private async doSend(text: string, callback?: TAgentStreamCallback): Promise<IAgentResult> {
        const controller = new AbortController()
        const generation = this.generation
        this.activeController = controller
        this.history.push({ role: 'user', content: text })

        // 超过上限时丢弃最早对话
        trimSessionHistory(this.history)

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

            // 会话已终止时不写回历史
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
        const controller = this.activeController
        this.activeController = null
        this.generation += 1

        if (!controller) return

        // 移除未完成的用户消息
        if (this.history.at(-1)?.role === 'user') {
            this.history.pop()
        }

        controller.abort()
    }

    /**
     * 清空历史并取消请求
     */
    clear() {
        this.abort()
        this.history.length = 0
    }
}

export class AgentHelper {
    /**
     * 创建多轮会话
     * @param options 会话参数
     */
    static createSession(options: IAgentSessionOptions) {
        return new AgentSession(options)
    }

    /**
     * 单轮流式请求
     * @param options 调用参数
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
     * 多轮流式请求
     * @param options 调用参数
     */
    static async chat(options: IAgentChatOptions): Promise<IAgentResult> {
        return AgentHelper.request(
            {
                config: options.config,
                // 复制一份，避免外部修改
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

        const re = await TaskHelper.tryExecute(async () => {
            let closed = false
            let isResolved = false
            let text = ''
            let reasoningText = ''

            let resolveTask!: (value: IAgentResult) => void
            let rejectTask!: (reason?: unknown) => void

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
                          timeout: input.timeout
                      }
                    : {
                          config: input.config,
                          prompt: input.prompt,
                          system: input.system,
                          timeout: input.timeout
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

                    // 非正常结束时清空半截内容
                    if (!isAgentSuccess(payload.finishReason)) {
                        callback?.('', '', true)
                    }

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
                    callback?.('', '', true)
                    resolveTask({
                        text,
                        ...(reasoningText ? { reasoningText } : {}),
                        finishReason: 'error',
                        error: 'AI流未正常结束'
                    })
                }
            })

            // 取消当前请求
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

            callback?.('', '', true)
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

            callback?.('', '', true)
            LogHelper.error(`AI流请求失败：${input.config.provider}:${input.config.model}`, error)
            return { text: '', finishReason: 'error', error: getErrorMessage(error) }
        } finally {
            re.result.dispose()
        }
    }
}
