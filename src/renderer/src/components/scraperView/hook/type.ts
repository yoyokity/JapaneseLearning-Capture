import type { Path } from '@renderer/helper'
import type { IVideoFile } from '@renderer/scraper'
import type { ScraperState } from '@renderer/scraper/hooks/type'

/**
 * 文件项
 */
export interface IFileItem {
    /** 文件路径 */
    file: Path
    /** 标题 */
    title: string
    /** 编号 */
    num: Record<string, string>
    /** 是否参与刮削 */
    checked: boolean
    /** 文件类型颜色 */
    extColor: string
    /** 刮削器名称 */
    scraper: string
    /** 进度 */
    progress: number
    /** 刮削状态 */
    scraperState: ScraperState | null
    /** 刮削状态文本 */
    scraperStateText?: string
    /** 刮削视频文件 */
    videoFile?: IVideoFile
}

/**
 * 文件项高度
 */
export const fileItemSize = 78

/**
 * 文件项状态颜色映射
 */
export const fileItemStateColorMap: Record<ScraperState, string> = {
    error: 'var(--error-color)',
    warn: 'var(--warning-color)',
    success: 'var(--success-color)'
}
