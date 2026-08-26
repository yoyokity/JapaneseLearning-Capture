import type { SuperResolutionModel } from '@shared'

import { LogHelper } from '@renderer/helper'
import { ipc } from '@renderer/ipc'
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

    /**
     * 可用超分模型列表
     */
    const modelNames = ref<SuperResolutionModel[]>([])

    /**
     * 模型列表加载任务（store 首次实例化时自动开始，供启动流程等待加载完成）
     */
    const modelNamesLoaded: Promise<void> = (async () => {
        try {
            modelNames.value = await ipc.media.getSuperResolutionModels.query()
        } catch (error) {
            LogHelper.error('加载可用超分模型失败', error)
        }
    })()

    return {
        /**
         * 可用超分模型列表
         */
        modelNames,
        /**
         * 模型列表加载任务
         */
        modelNamesLoaded,

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
