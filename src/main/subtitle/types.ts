import type { IAgentConfig } from '../agent'

export type SubtitleLanguage = 'ja' | 'en' | 'zh' | 'ko'

export type SubtitleStage = 'extract' | 'asr' | 'translate'

export type ISubtitleLlm = IAgentConfig

export interface IGenerateSubtitleInput {
    /** 视频路径 */
    inputPath: string
    /** 识别语言 */
    language: SubtitleLanguage
    /** 是否使用 AI 翻译 */
    aiOptimize: boolean
    /** AI 翻译配置 */
    llm?: ISubtitleLlm | undefined
}

export interface ISubtitleProgress {
    /** 当前阶段 */
    stage: SubtitleStage
    /** 进度 0-1，-1 未知 */
    progress: number
    /** 附加文案 */
    message?: string
    /** 输出文件路径 */
    outputPath?: string
}

export interface IWord {
    text: string
    from: number
    to: number
}

export interface ISegment {
    /** ASR 段 ID */
    chunkId?: number | undefined
    /** 段文本 */
    text: string
    /** 段开始时间（毫秒） */
    from: number
    /** 段结束时间（毫秒） */
    to: number
    /** 原始时间戳字符串 */
    timestamps?: { from: string; to: string } | undefined
    words: IWord[]
}

export interface ICueDraft {
    from: number
    to: number
    text: string
}

export interface ICue extends ICueDraft {
    id: string
    zh?: string
}

export interface ISentence {
    from: number
    to: number
    text: string
}
