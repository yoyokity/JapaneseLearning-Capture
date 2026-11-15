import type { IAgentConfig } from '../agent'

export type SubtitleLanguage = 'ja' | 'en' | 'zh' | 'ko'

export type SubtitleStage = 'extract' | 'asr' | 'optimize' | 'translate'

export type ISubtitleLlm = IAgentConfig

export interface IGenerateSubtitleInput {
    /** 视频路径 */
    inputPath: string
    /** 识别语言 */
    language: SubtitleLanguage
    /** 是否 AI 优化 */
    aiOptimize: boolean
    /** AI 优化配置 */
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
