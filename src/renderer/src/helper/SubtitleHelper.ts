import type { IGenerateSubtitleInput, ISubtitleProgress } from '@shared'

import { ipc } from '@renderer/ipc'

import { LogHelper } from './LogHelper'

/**
 * 字幕生成相关
 */
export class SubtitleHelper {
    /**
     * 生成中文字幕
     * @param options 生成参数
     * @param options.input 字幕生成参数
     * @param options.onProgress 进度回调
     * @param options.onCancelRegister 注册取消函数，调用后会终止任务并结束订阅，结果以 null 结束
     * @returns 成功时返回输出文件路径，取消或失败返回 null
     */
    static generate(options: {
        input: IGenerateSubtitleInput
        onProgress?: (progress: ISubtitleProgress) => void
        onCancelRegister?: (cancel: () => void) => void
    }): Promise<string | null> {
        return new Promise((resolve) => {
            let outputPath = ''

            const subscription = ipc.subtitle.generate.subscribe(options.input, {
                onData(payload) {
                    if (payload.outputPath) outputPath = payload.outputPath
                    options.onProgress?.(payload)
                },
                onError(error) {
                    LogHelper.error('字幕生成失败：', error)
                    resolve(null)
                },
                onComplete() {
                    resolve(outputPath || null)
                }
            })

            // 取消订阅不会触发任何回调，这里主动结束 Promise
            options.onCancelRegister?.(() => {
                subscription.unsubscribe()
                resolve(null)
            })
        })
    }
}
