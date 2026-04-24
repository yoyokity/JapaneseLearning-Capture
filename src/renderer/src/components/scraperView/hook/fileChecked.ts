import type { Ref } from 'vue'
import type { IFileItem } from './type'

import { globalStatesStore } from '@renderer/stores'
import { computed } from 'vue'

/**
 * 文件选中Hook
 */
export function useFileChecked(fileList: Ref<IFileItem[]>) {
    const globalStates = globalStatesStore()

    /**
     * 获取文件item禁用状态
     * @description 开始刮削后，所有文件都禁用；刮削完成的文件禁用
     * @param item 文件项
     */
    function getFileDisable(item: IFileItem) {
        // 开始刮削后，所有文件都禁用
        if (globalStates.batchRunning) {
            return true
        }

        if (item.scraperState === null && item.progress <= 0) {
            return false
        }

        // 刮削完成的文件禁用
        return true
    }

    const isAllChecked = computed(() => {
        const enableFileList = fileList.value.filter((item) => !getFileDisable(item))

        return enableFileList.length > 0 && enableFileList.every((item) => item.checked)
    })

    /**
     * 需要刮削的文件列表
     */
    const checkedFileList = computed(() =>
        fileList.value.filter((item) => item.checked && item.progress <= 0)
    )

    /**
     * 切换文件选中状态
     * @param item 文件项
     */
    function toggleFileChecked(item: IFileItem) {
        item.checked = !item.checked
    }

    /**
     * 切换全部文件选中状态
     */
    function toggleAllFilesChecked() {
        const nextChecked = !isAllChecked.value
        fileList.value.forEach((item) => {
            if (getFileDisable(item)) return

            item.checked = nextChecked
        })
    }

    return {
        getFileDisable,
        isAllChecked,
        checkedFileList,
        toggleFileChecked,
        toggleAllFilesChecked
    }
}
