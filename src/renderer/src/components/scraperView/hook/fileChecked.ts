import type { Ref } from 'vue'
import type { FileItem } from './type'

import { computed } from 'vue'

/**
 * 文件选中Hook
 */
export function useFileChecked(fileList: Ref<FileItem[]>) {
    const isAllChecked = computed(() => {
        const enableFileList = fileList.value.filter((item) => !item.disabled)

        return enableFileList.length > 0 && enableFileList.every((item) => item.checked)
    })

    /**
     * 切换全部文件选中状态
     */
    function toggleAllFilesChecked() {
        const nextChecked = !isAllChecked.value
        fileList.value.forEach((item) => {
            if (item.disabled) return

            item.checked = nextChecked
        })
    }

    return {
        isAllChecked,
        toggleAllFilesChecked
    }
}
