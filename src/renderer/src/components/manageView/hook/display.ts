import type { IVideoFile } from '@renderer/scraper'
import type { Dayjs } from 'dayjs'
import type { ManageCardItem } from './type'

import { settingsStore } from '@renderer/stores'
import dayjs from 'dayjs'
import { defineStore } from 'pinia'
import { computed, reactive, ref, watch } from 'vue'

export const useDisplay = defineStore('useDisplay', () => {
    const settings = settingsStore()

    /**
     * 当前选中的系列
     */
    const currentSetField = ref<string | null>(null)
    /**
     * 文件列表
     */
    const manageViewFiles = reactive<IVideoFile[]>([])
    /**
     * 是否有文件
     */
    const hasManageViewFiles = computed(() => manageViewFiles.length > 0)
    /**
     * 文件列表过滤值
     */
    const manageViewFilesFilterValue = ref<string>('')
    /**
     * 是否在系列页面
     */
    const isSetView = computed(() => currentSetField.value !== null)
    /**
     * 当前排序是否正序
     */
    const isPositiveOrder = computed({
        get() {
            return !settings.manageViewSortReverse
        },
        set(value: boolean) {
            settings.manageViewSortReverse = !value
        }
    })
    /**
     * 标签列表
     */
    const tagsList = computed(() => {
        const tagCountMap = new Map<string, number>()

        for (const file of manageViewFiles) {
            for (const tag of file.tag) {
                tagCountMap.set(tag, (tagCountMap.get(tag) || 0) + 1)
            }
        }

        return [...tagCountMap]
            .map(([tag, count]) => ({
                tag,
                count
            }))
            .sort((a, b) => b.count - a.count)
    })
    /**
     * 当前选中的标签
     */
    const currentTagField = ref<string[]>([])

    /**
     * 设置管理视图文件列表文件
     */
    function setManageViewFiles(files: IVideoFile[]) {
        if (files.length === 0) {
            manageViewFiles.splice(0, manageViewFiles.length)
        } else {
            manageViewFiles.splice(0, manageViewFiles.length, ...files)
        }
    }

    /**
     * 获取系列封面视频
     * @param files 系列文件列表
     */
    function getSeriesCoverVideo(files: IVideoFile[]) {
        const filteredFiles = files.filter((file) => file.poster && file.fanart && file.thumb)

        return [...(filteredFiles.length ? filteredFiles : files)].sort((a, b) =>
            a.sorttitle.localeCompare(b.sorttitle, undefined, { sensitivity: 'base' })
        )[0]
    }

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
            return isReverse ? dateB.valueOf() - dateA.valueOf() : dateA.valueOf() - dateB.valueOf()
        }

        return 0
    }

    /**
     * 文件列表过滤后的，筛选+排序 后的文件列表
     */
    const manageViewFilesFilter = computed(() => {
        const keyword = manageViewFilesFilterValue.value.trim()
        const hasCurrentTag = currentTagField.value.length > 0

        return manageViewFiles
            .filter((file) => {
                if (keyword) {
                    const hasKeyword =
                        file.title.includes(keyword) ||
                        file.originaltitle.includes(keyword) ||
                        file.sorttitle.includes(keyword) ||
                        file.set.includes(keyword)

                    if (!hasKeyword) return false
                }

                if (!hasCurrentTag) return true

                return settings.manageViewTagsMatchAll
                    ? currentTagField.value.every((tag) => file.tag.includes(tag))
                    : currentTagField.value.some((tag) => file.tag.includes(tag))
            })
            .sort(videoSortFunc)
    })

    const displayItems = computed<ManageCardItem[]>(() => {
        const files = manageViewFilesFilter.value
        const allFiles = manageViewFiles
        const isSearching = manageViewFilesFilterValue.value.trim() !== ''

        if (currentSetField.value) {
            return files
                .filter((file) => file.set === currentSetField.value)
                .map((video) => ({
                    type: 'video',
                    video
                }))
        }

        const setMap = new Map<string, IVideoFile[]>()
        const allSetMap = new Map<string, IVideoFile[]>()

        for (const file of allFiles) {
            const setName = file.set.trim()
            if (!setName) continue

            const setFiles = allSetMap.get(setName) || []
            setFiles.push(file)
            allSetMap.set(setName, setFiles)
        }

        for (const file of files) {
            const setName = file.set.trim()
            if (!setName) continue

            const setFiles = setMap.get(setName) || []
            setFiles.push(file)
            setMap.set(setName, setFiles)
        }

        const items: ManageCardItem[] = []
        // 记录已加入的系列，避免在循环中重复遍历 items
        const addedSetNames = new Set<string>()

        for (const file of files) {
            const setName = file.set.trim()

            if (!setName) {
                items.push({
                    type: 'video',
                    video: file
                })
                continue
            }

            const setFiles = setMap.get(setName) || []
            const allSetFiles = allSetMap.get(setName) || []

            if (!isSearching && allSetFiles.length <= 1) {
                items.push({
                    type: 'video',
                    video: file
                })
                continue
            }

            if (addedSetNames.has(setName)) {
                continue
            }

            addedSetNames.add(setName)
            items.push({
                type: 'series',
                name: setName,
                coverVideo: getSeriesCoverVideo(allSetFiles),
                files: setFiles
            })
        }

        return items
    })

    // 实时更新当前选中的系列
    watch(
        () => manageViewFilesFilter,
        (files) => {
            if (!currentSetField.value) return

            const hasCurrentSet = files.value.some((file) => file.set === currentSetField.value)

            if (!hasCurrentSet) currentSetField.value = null
        },
        { deep: true }
    )

    return {
        /**
         * 是否有管理页显示的文件
         */
        hasManageViewFiles,
        /**
         * 管理页显示的文件列表
         * @remarks 可能也是系列
         */
        displayItems,
        /**
         * 设置文件列表文件
         */
        setManageViewFiles,
        /**
         * 当前选中的系列
         */
        currentSetField,
        /**
         * 是否在系列页面
         */
        isSetView,
        /**
         * 当前排序是否正序
         */
        isPositiveOrder,
        /**
         * 文件列表过滤值
         */
        manageViewFilesFilterValue,
        /**
         * 标签列表
         */
        tagsList,
        /**
         * 当前选中的标签
         */
        currentTagField,
        /**
         * 文件列表过滤后的，筛选+排序 后的文件列表
         */
        manageViewFilesFilter
    }
})

/**
 * 解析日期字符串为 Dayjs 对象
 * 支持格式：2025-06-27, 2025.06.27, 2025/06/27, 2025\06\27
 */
function parseDateString(dateStr: string): Dayjs {
    if (!dateStr || dateStr.trim() === '') {
        return dayjs(0) // 返回最早的日期作为默认值
    }

    // 将所有分隔符统一为 '-'
    const normalizedDate = dateStr.replace(/[.\\/]/g, '-')
    const date = dayjs(normalizedDate)

    // 如果解析失败，返回最早的日期
    if (!date.isValid()) {
        return dayjs(0)
    }

    return date
}
