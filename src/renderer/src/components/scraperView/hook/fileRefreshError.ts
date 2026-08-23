import type { Ref } from 'vue'
import type { FileItem } from './type'

import { computed } from 'vue'

/**
 * 错误文件重置Hook
 */
export function useFileRefreshError(fileList: Ref<FileItem[]>) {
    const hasErrorFiles = computed(() => {
        return fileList.value.some((item) => item.scraperState === 'error')
    })

    /**
     * 将所有错误状态的文件重置为初始状态
     */
    function refreshErrorFiles() {
        fileList.value.forEach((item) => {
            if (item.scraperState !== 'error') return

            item.scraperState = null
            item.scraperStateText = undefined
            item.progress = 0
        })
    }

    return {
        hasErrorFiles,
        refreshErrorFiles
    }
}
