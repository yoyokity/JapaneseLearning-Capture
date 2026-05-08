import { defineStore } from 'pinia'
import { ref } from 'vue'

export const globalStatesStore = defineStore('globalStates', () => {
    /**
     * 图片缓存版本
     * @description 用于刷新同路径图片的显示缓存
     */
    const imageCacheVersion = ref(Date.now())
    /**
     * 刷新图片缓存版本
     */
    function refreshImageCacheVersion() {
        imageCacheVersion.value = Date.now()
    }

    /**
     * 已刮削数量
     */
    const batchScrapedCount = ref(0)

    /**
     * 批量刮削总数
     */
    const batchTotalCount = ref(0)

    /**
     * 批量刮削的运行状态
     */
    const batchRunning = ref(false)

    return {
        /**
         * 已刮削数量
         */
        batchScrapedCount,
        /**
         * 批量刮削总数
         */
        batchTotalCount,
        /**
         * 批量刮削的运行状态
         */
        batchRunning,

        /**
         * 是否正在进行文件扫描
         */
        scanFilesLoading: ref(false),
        /**
         * 图片缓存版本
         * @description 用于刷新同路径图片的显示缓存
         */
        imageCacheVersion,
        /**
         * 刷新图片缓存版本
         */
        refreshImageCacheVersion
    }
})
