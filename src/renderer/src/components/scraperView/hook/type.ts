import type { Path } from '@renderer/helper'
import type { IVideoFile } from '@renderer/scraper'
import type { ScraperState } from '@renderer/scraper/hooks/type'

import { videoExtensions } from '@renderer/helper'
import { globalStatesStore, settingsStore } from '@renderer/stores'

/**
 * 文件项状态颜色映射
 */
export const fileItemStateColorMap: Record<ScraperState, string> = {
    error: 'var(--error-color)',
    warn: 'var(--warning-color)',
    success: 'var(--success-color)'
}

/**
 * 文件项
 */
export class FileItem {
    /** 文件路径 */
    file: Path
    /** 标题 */
    title: string
    /** 编号 */
    num: Record<string, string>
    /** 是否参与刮削 */
    checked: boolean
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

    constructor(filePath: Path) {
        const settings = settingsStore()

        this.file = filePath
        this.title = filePath.basename
        this.num = {}
        this.checked = true
        this.scraper = settings.currentScraper
        this.progress = 0
        this.scraperState = null
    }

    /**
     * 文件类型颜色
     */
    get extColor(): string {
        const ext = this.file.extname.toLowerCase()
        return videoExtensions[ext] || 'var(--p-text-muted-color)'
    }

    /**
     * 当前文件的进度条颜色
     */
    get progressColor() {
        return this.scraperState ? fileItemStateColorMap[this.scraperState] : this.extColor
    }

    /**
     * 文件item禁用状态
     * @description 开始刮削后，所有文件都禁用；刮削完成的文件禁用
     */
    get disabled() {
        const globalStates = globalStatesStore()
        return globalStates.batchRunning || this.scraperState !== null || this.progress > 0
    }

    /**
     * 编号展示文本
     */
    get numText() {
        return Object.entries(this.num)
            .map(([key, value]) => `${key}:${value}`)
            .join(',  ')
    }

    /**
     * 文件提示文本
     */
    get tooltipText() {
        if (this.scraperState === null || this.scraperState === 'success') return undefined

        return `${this.scraperState === 'error' ? '失败' : '提示'}：\n ${this.scraperStateText}`
    }

    /**
     * 是否刮削完成
     * @description 就是看videoFile字段是否存在
     */
    get scraperCompleted() {
        return Boolean(this.videoFile)
    }

    /**
     * 是否可以刮削
     */
    get scraperable() {
        return this.checked && !this.scraperCompleted
    }

    /**
     * 切换选中状态
     */
    toggleChecked() {
        this.checked = !this.checked
    }
}
