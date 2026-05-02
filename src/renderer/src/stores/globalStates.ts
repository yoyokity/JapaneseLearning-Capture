import type { IVideoFile } from '@renderer/scraper'

import { defineStore } from 'pinia'
import { computed, reactive, ref } from 'vue'

import { settingsStore } from './settings'

export const globalStatesStore = defineStore('globalStates', () => {
    /**
     * 管理视图文件列表
     */
    const manageViewFiles = reactive<IVideoFile[]>([])
    function setManageViewFiles(files: IVideoFile[]) {
        manageViewFiles.splice(0, manageViewFiles.length, ...files)
    }

    /**
     * 管理视图文件列表过滤值
     */
    const manageViewFilesFilterValue = ref<string>('')

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

    const settings = settingsStore()

    /**
     * 视频排序
     */
    function videoSortFunc(a: IVideoFile, b: IVideoFile) {
        const isReverse = settings.manageViewSortReverse

        // 标题
        if (settings.manageViewSort === 'title') {
            return isReverse
                ? b.sorttitle.localeCompare(a.sorttitle, undefined, { sensitivity: 'base' })
                : a.sorttitle.localeCompare(b.sorttitle, undefined, { sensitivity: 'base' })
        }

        // 加入时间
        if (settings.manageViewSort === 'joinTime') {
            return isReverse ? b.dirJoinTime.diff(a.dirJoinTime) : a.dirJoinTime.diff(b.dirJoinTime)
        }

        // 编辑时间
        if (settings.manageViewSort === 'changeTime') {
            return isReverse ? b.changeTime.diff(a.changeTime) : a.changeTime.diff(b.changeTime)
        }

        // 发布日期
        if (settings.manageViewSort === 'releasedate') {
            const dateA = parseDateString(a.releasedate)
            const dateB = parseDateString(b.releasedate)
            return isReverse ? dateB.getTime() - dateA.getTime() : dateA.getTime() - dateB.getTime()
        }

        return 0
    }
    /**
     * 管理视图文件列表过滤后的，筛选+排序 后的文件列表
     */
    const manageViewFilesFilter = computed(() => {
        if (manageViewFilesFilterValue.value.trim() !== '') {
            return (
                manageViewFiles.filter((file) => {
                    return (
                        file.title.includes(manageViewFilesFilterValue.value) ||
                        file.originaltitle.includes(manageViewFilesFilterValue.value) ||
                        file.sorttitle.includes(manageViewFilesFilterValue.value) ||
                        file.set.toString().includes(manageViewFilesFilterValue.value)
                    )
                }) as IVideoFile[]
            ).sort(videoSortFunc)
        } else {
            return [...(manageViewFiles as IVideoFile[])].sort(videoSortFunc)
        }
    })

    //

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
        // #region 批量刮削部分
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
        // #endregion 批量刮削部分

        // #region 管理tab的文件列表部分
        /**
         * 管理视图文件列表
         */
        manageViewFiles,
        /**
         * 设置管理视图文件列表文件
         */
        setManageViewFiles,
        /**
         * 管理视图文件列表过滤后的，筛选+排序 后的文件列表
         */
        manageViewFilesFilter,
        /**
         * 管理视图文件列表过滤值
         */
        manageViewFilesFilterValue,
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
        // #endregion 管理tab的文件列表部分
    }
})

/**
 * 解析日期字符串为Date对象
 * 支持格式：2025-06-27, 2025.06.27, 2025/06/27, 2025\06\27
 */
function parseDateString(dateStr: string): Date {
    if (!dateStr || dateStr.trim() === '') {
        return new Date(0) // 返回最早的日期作为默认值
    }

    // 将所有分隔符统一为 '-'
    const normalizedDate = dateStr.replace(/[.\\/]/g, '-')
    const date = new Date(normalizedDate)

    // 如果解析失败，返回最早的日期
    if (Number.isNaN(date.getTime())) {
        return new Date(0)
    }

    return date
}
