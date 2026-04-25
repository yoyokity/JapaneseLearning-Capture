import type { Ref } from 'vue'
import type { IFileItem } from './type'

import { useMessage } from '@renderer/components/control/message'
import { LogHelper, TaskHelper } from '@renderer/helper'
import { useBatchScraper } from '@renderer/scraper/hooks/useBatchScraper'
import { globalStatesStore } from '@renderer/stores'
import { cloneDeep } from 'es-toolkit'

/**
 * 开始取消刮削Hook
 */
export function useScraperStartCancel(checkedFileList: Ref<IFileItem[]>) {
    const globalStates = globalStatesStore()
    const message = useMessage()
    const { scraperRun } = useBatchScraper()

    /**
     * 开始刮削
     */
    async function handleStart() {
        if (!checkedFileList.value.length) {
            message.toast.info('没有需要刮削的文件')
            return
        }

        globalStates.batchRunning = true
        globalStates.batchScrapedCount = 0
        globalStates.batchTotalCount = checkedFileList.value.length

        // 遍历所有需要刮削的文件
        for (const file of checkedFileList.value) {
            TaskHelper.queueWithCancel({ taskName: 'scraper-batch-all' }, async () => {
                // 刮削单个文件
                const { scraperState, scraperStateText, videoFile } = await scraperRun(
                    cloneDeep({
                        title: file.title,
                        num: file.num
                    }),
                    file.file,
                    file.scraper,
                    (progress) => {
                        file.progress = progress
                    }
                )

                // 更新文件状态
                file.scraperState = scraperState
                file.scraperStateText = scraperStateText
                file.videoFile = videoFile

                // 更新批量刮削进度
                globalStates.batchScrapedCount += 1
            })
        }

        TaskHelper.queueWithCancel({ taskName: 'scraper-batch-all' }, () => {
            globalStates.batchRunning = false
        })
    }

    /**
     * 取消刮削
     */
    function handleCancel() {
        TaskHelper.queueClear(['scraper-batch-single', 'scraper-batch-all'])

        globalStates.batchRunning = false
        LogHelper.warn('刮削已取消！')
    }

    return {
        handleStart,
        handleCancel
    }
}
