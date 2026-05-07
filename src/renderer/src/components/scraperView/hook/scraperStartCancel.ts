import type { Ref } from 'vue'
import type { FileItem } from './type'

import { useMessage } from '@renderer/components/control/message'
import { LogHelper, PathHelper } from '@renderer/helper'
import { useBatchScraper } from '@renderer/scraper/hooks/useBatchScraper'
import { globalStatesStore } from '@renderer/stores'
import dayjs from 'dayjs'

/**
 * 开始取消刮削Hook
 */
export function useScraperStartCancel(fileList: Ref<FileItem[]>) {
    const globalStates = globalStatesStore()
    const message = useMessage()
    const { scraperRun } = useBatchScraper()

    let currentController: AbortController | null = null
    let currentFile: FileItem | null = null

    /**
     * 开始刮削
     */
    async function handleStart() {
        const fileListWithScraperable = fileList.value.filter((item) => item.scraperable)

        if (!fileListWithScraperable.length) {
            message.toast.info('没有需要刮削的文件')
            return
        }

        currentController = new AbortController()
        const { signal } = currentController

        globalStates.batchRunning = true
        globalStates.batchScrapedCount = 0
        globalStates.batchTotalCount = fileListWithScraperable.length

        // 遍历所有需要刮削的文件
        for (const file of fileListWithScraperable) {
            if (signal.aborted) break
            currentFile = file

            // 刮削单个文件
            const { scraperState, scraperStateText, videoFile } = await scraperRun(
                { title: file.title, num: file.num },
                file.file,
                file.scraper,
                signal,
                (progress) => {
                    file.progress = progress
                }
            )

            if (signal.aborted) {
                break
            }

            // 更新文件状态
            file.scraperState = scraperState
            file.scraperStateText = scraperStateText

            if (videoFile) {
                // 获取新的stats
                const videoStats = await PathHelper.getStats(videoFile.path)
                const nfoStats = await PathHelper.getStats(videoFile.nfoPath!)
                const dirStats = await PathHelper.getStats(videoFile.dir)

                file.videoFile = {
                    ...videoFile,
                    size: videoStats?.size ?? 0,
                    joinTime: dayjs(videoStats?.ctime),
                    dirJoinTime: dayjs(dirStats?.ctime),
                    changeTime: dayjs(nfoStats?.mtime)
                }
            }

            // 更新批量刮削进度
            globalStates.batchScrapedCount += 1
        }

        currentController = null
        currentFile = null
        globalStates.batchRunning = false
    }

    /**
     * 取消刮削
     */
    function handleCancel() {
        if (currentController) {
            currentController.abort()

            if (currentFile) {
                currentFile.progress = 100
                currentFile.scraperState = 'error'
                currentFile.scraperStateText = '刮削已取消！'
            }

            globalStates.batchRunning = false
            LogHelper.warn('刮削已取消！')
        }
    }

    return {
        handleStart,
        handleCancel
    }
}
