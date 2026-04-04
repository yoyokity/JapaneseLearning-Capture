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
        if (settings.manageViewSort === 'title') {
            return a.sorttitle.localeCompare(b.sorttitle, undefined, { sensitivity: 'base' })
        } else if (settings.manageViewSort === 'title_reverse') {
            return b.sorttitle.localeCompare(a.sorttitle, undefined, { sensitivity: 'base' })
        } else if (settings.manageViewSort === 'releasedate') {
            const dateA = parseDateString(a.releasedate)
            const dateB = parseDateString(b.releasedate)
            return dateA.getTime() - dateB.getTime()
        } else if (settings.manageViewSort === 'releasedate_reverse') {
            const dateA = parseDateString(a.releasedate)
            const dateB = parseDateString(b.releasedate)
            return dateB.getTime() - dateA.getTime()
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

    return {
        manageViewFiles,
        setManageViewFiles,
        manageViewFilesFilter,
        manageViewFilesFilterValue,

        //loading状态

        /**
         * 是否正在进行文件扫描
         */
        scanFilesLoading: ref(false),
        imageCacheVersion,
        refreshImageCacheVersion
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
