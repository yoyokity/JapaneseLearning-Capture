<script lang="ts" setup>
import type { IVideoFile } from '@renderer/scraper'
import type { SelectChangeEvent } from 'primevue/select'

import Scroll from '@renderer/components/control/scroll/scroll.vue'
import { scanFiles } from '@renderer/components/manageView/func'
import VideoCard from '@renderer/components/manageView/videoCard.vue'
import { PathHelper } from '@renderer/helper'
import { Scraper } from '@renderer/scraper'
import { globalStatesStore, settingsStore, VideoSortTypeList } from '@renderer/stores'
import Button from 'primevue/button'
import ContextMenu from 'primevue/contextmenu'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import { useToast } from 'primevue/usetoast'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

const settings = settingsStore()
const globalStates = globalStatesStore()
const toast = useToast()

const cm = ref()
const currentVideo = ref<IVideoFile | null>(null)
const currentSet = ref<string | null>(null)

const isSortActive = ref(false)
const isSearchActive = ref(false)
const isFloatActive = computed(() => isSortActive.value || isSearchActive.value)

interface ISeriesCardItem {
    type: 'series'
    name: string
    coverVideo: IVideoFile
    files: IVideoFile[]
}

interface IVideoCardItem {
    type: 'video'
    video: IVideoFile
}

type ManageCardItem = ISeriesCardItem | IVideoCardItem

// 右键菜单项
const menuItems = ref([
    {
        label: '播放',
        icon: 'pi pi-play-circle',
        command: () => {
            if (currentVideo.value) {
                PathHelper.openInExplorer(currentVideo.value.path.toString())
            }
        }
    },
    {
        label: '打开文件夹',
        icon: 'pi pi-folder-open',
        command: () => {
            if (currentVideo.value) {
                PathHelper.openInExplorer(currentVideo.value.dir.toString())
            }
        }
    }
])

//重新选择目录后，清除文件列表
function clearFiles(e: SelectChangeEvent) {
    if (e.value !== settings.currentScraper) {
        globalStates.manageViewFiles = []
        currentSet.value = null
    }
}

//重新排序
function handleSortChange(e: SelectChangeEvent) {
    settings.manageViewSort = e.value
}

/**
 * 显示右键菜单
 */
function showMenu(event: MouseEvent, video: IVideoFile) {
    currentVideo.value = video
    cm.value.show(event)
}

/**
 * 滚动时关闭右键菜单
 */
function hideMenuOnScroll() {
    cm.value?.hide?.()
}

/**
 * 管理页展示列表
 */
const displayItems = computed<ManageCardItem[]>(() => {
    const files = globalStates.manageViewFilesFilter as IVideoFile[]
    const allFiles = globalStates.manageViewFiles as IVideoFile[]
    const isSearching = globalStates.manageViewFilesFilterValue.trim() !== ''

    if (currentSet.value) {
        return files
            .filter((file) => file.set === currentSet.value)
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

        if (items.some((item) => item.type === 'series' && item.name === setName)) {
            continue
        }

        items.push({
            type: 'series',
            name: setName,
            coverVideo: allSetFiles[0],
            files: setFiles
        })
    }

    return items
})

/**
 * 是否在系列详情视角
 */
const isSetView = computed(() => currentSet.value !== null)

/**
 * 点击系列卡片
 */
function enterSet(setName: string) {
    currentSet.value = setName
    hideMenuOnScroll()
}

/**
 * 回到主页视角
 */
function backToHomeView() {
    currentSet.value = null
    hideMenuOnScroll()
}

/**
 * 处理鼠标和键盘返回
 */
function handleBackAction(event: MouseEvent | KeyboardEvent) {
    if (!isSetView.value) return

    if (event instanceof MouseEvent) {
        // 鼠标侧键返回
        if (event.button === 3) {
            event.preventDefault()
            backToHomeView()
        }
        return
    }

    // Alt + 左方向键 / Backspace 视为返回
    if (
        (event.key === 'ArrowLeft' && event.altKey) ||
        event.key === 'BrowserBack' ||
        event.key === 'Backspace'
    ) {
        const target = event.target as HTMLElement | null
        const tagName = target?.tagName?.toUpperCase()
        const isEditable =
            !!target && (target.isContentEditable || tagName === 'INPUT' || tagName === 'TEXTAREA')

        if (isEditable && event.key === 'Backspace') return

        event.preventDefault()
        backToHomeView()
    }
}

/**
 * 处理卡片点击
 */
function handleCardClick(item: ManageCardItem, _event: MouseEvent) {
    if (item.type === 'series') {
        enterSet(item.name)
    }
}

/**
 * 处理卡片右键
 */
function handleCardContextmenu(item: ManageCardItem, event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()

    if (item.type !== 'video') return

    showMenu(event, item.video)
}

watch(
    () => globalStates.manageViewFilesFilter,
    (files) => {
        if (!currentSet.value) return

        const hasCurrentSet = (files as IVideoFile[]).some((file) => file.set === currentSet.value)
        if (!hasCurrentSet) {
            currentSet.value = null
        }
    },
    { deep: true }
)

onMounted(() => {
    window.addEventListener('mouseup', handleBackAction)
    window.addEventListener('keydown', handleBackAction)
})

onUnmounted(() => {
    window.removeEventListener('mouseup', handleBackAction)
    window.removeEventListener('keydown', handleBackAction)
})
</script>

<template>
    <div class="manage-view">
        <div class="tab-header">
            <h3 v-if="!isSetView">管理</h3>
            <div v-else class="manage-view-back-wrapper">
                <i
                    v-tooltip.left="'返回'"
                    class="pi pi-arrow-left manage-view-back"
                    @click="backToHomeView"
                />
                <h3 style="transform: translate(0.5rem, -1px)">{{ currentSet }}</h3>
            </div>
            <Select
                v-model="settings.currentScraper"
                v-tooltip.left="'选择目录'"
                :options="Scraper.instances.map((scraper) => scraper.scraperName)"
                size="small"
                style="width: 8rem"
                @change="clearFiles"
            />
            <Button
                :loading="globalStates.scanFilesLoading"
                icon="pi pi-refresh"
                label="开始扫描"
                size="small"
                style="width: 7rem"
                @click="scanFiles(toast)"
            />
        </div>
        <Scroll
            style="height: calc(100% - var(--header-height))"
            :scrollbar-occupy-space="false"
            @touchmove="hideMenuOnScroll"
            @wheel.capture="hideMenuOnScroll"
        >
            <transition mode="out-in" name="manage-view-fade">
                <div :key="currentSet || 'home'" class="manage-view-content">
                    <!-- 卡片视图 -->
                    <template
                        v-for="item in displayItems"
                        :key="
                            item.type === 'series'
                                ? `series-${item.name}`
                                : item.video.path.toString()
                        "
                    >
                        <VideoCard
                            :video="item.type === 'series' ? item.coverVideo : item.video"
                            :title="item.type === 'series' ? item.name : undefined"
                            :on-click="
                                item.type === 'series'
                                    ? (_, event) => {
                                          handleCardClick(item, event)
                                      }
                                    : undefined
                            "
                            @contextmenu="(event) => handleCardContextmenu(item, event)"
                        />
                    </template>
                </div>
            </transition>
        </Scroll>

        <!--灵动岛-->
        <div v-if="globalStates.manageViewFiles.length > 0" class="manage-view-float">
            <div :class="{ active: isFloatActive }" class="manage-view-float-content">
                <!-- 搜索 -->
                <i
                    v-tooltip.top="'搜索'"
                    :class="{ active: isSearchActive }"
                    class="search-button pi pi-search"
                    @click="
                        () => {
                            isSearchActive = !isSearchActive
                            globalStates.manageViewFilesFilterValue = ''
                        }
                    "
                />
                <transition name="search-animation">
                    <div v-show="isSearchActive" class="search-input-container">
                        <InputText
                            v-model="globalStates.manageViewFilesFilterValue"
                            class="search-input"
                            placeholder="搜索"
                            size="small"
                            @blur="
                                () => {
                                    if (globalStates.manageViewFilesFilterValue.trim() === '') {
                                        isSearchActive = false
                                    }
                                }
                            "
                        />
                    </div>
                </transition>

                <!-- 排序 -->
                <Select
                    v-model="settings.manageViewSort"
                    v-tooltip.top="'排序'"
                    :option-label="(option) => VideoSortTypeList[option]"
                    :options="Object.keys(VideoSortTypeList)"
                    class="sort-select"
                    dropdown-icon="pi pi-sort-amount-down"
                    size="small"
                    @change="handleSortChange"
                    @hide="isSortActive = false"
                    @show="isSortActive = true"
                />
            </div>
        </div>

        <!-- 右键菜单 -->
        <ContextMenu ref="cm" :model="menuItems" />
    </div>
</template>

<style lang="scss" scoped>
.manage-view {
    width: 100%;
    height: 100%;
    position: relative;
}

.manage-view-back-wrapper {
    margin-right: auto;
    display: flex;
    align-items: center;
    gap: 0.5rem;

    h3 {
        margin: 0;
        font-weight: normal;
        pointer-events: none;
        color: inherit;
    }
}

.manage-view-back {
    font-size: 1.1rem;
    cursor: pointer;

    &:hover {
        color: var(--p-primary-color);
    }
}

.manage-view-content {
    padding: 1.25rem;
    display: grid;
    /* 根据容器宽度自动调整列数，最小宽度为150px，最大为1fr */
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    /* 设置行间距和列间距 */
    gap: 1rem;
    /* 确保网格项目保持一致的宽高比 */
    grid-auto-flow: dense; /* 使用dense填充算法，减少空白 */
}

.manage-view-float {
    position: absolute;
    left: 50%;
    bottom: 0;
    transform: translateX(-50%);
    width: fit-content;
    display: inline-flex;

    .manage-view-float-content {
        z-index: 2;
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: var(--p-surface-200);
        margin-bottom: 1rem;
        border-radius: 10rem;
        padding: 0 0.5rem;
        height: 2rem;
        transition: all 0.2s ease-in-out;
        opacity: 0.8;
        cursor: pointer;

        &:hover,
        &.active {
            opacity: 1;
            background-color: var(--p-surface-0);
            box-shadow: 0 0 10px 0 rgba(0, 0, 0, 0.3);
        }

        .search-button {
            color: var(--p-text-muted-color);
            transition: color 0.3s var(--animation-type);
            margin-right: 0.25rem;

            &:hover,
            &.active {
                color: var(--p-primary-color);
            }
        }

        .search-input-container {
            width: 10rem;
            height: 1.5rem;
            overflow: hidden;

            .search-input {
                width: 100%;
                height: 100%;
                border-radius: 10rem;
                padding: 0 0.5rem;
            }
        }

        .sort-select {
            --p-select-dropdown-width: 100%;
            --p-select-dropdown-color: var(--p-text-muted-color);

            width: 1rem;
            border: none !important;
            background: transparent !important;
            transition: color 0.3s var(--animation-type);
            margin-left: 0.25rem;

            :deep(.p-select-label) {
                display: none;
            }

            &:hover {
                --p-select-dropdown-color: var(--p-primary-color);
            }
        }
    }
}

.search-animation-enter-active,
.search-animation-leave-active {
    transition: all 0.3s var(--animation-type);
    max-width: 10rem;
}

.search-animation-enter-from,
.search-animation-leave-to {
    max-width: 0;
    opacity: 0;
}

.search-animation-enter-to,
.search-animation-leave-from {
    max-width: 10rem;
    opacity: 1;
}

.manage-view-fade-enter-active,
.manage-view-fade-leave-active {
    transition: opacity 0.2s ease;
}

.manage-view-fade-enter-from,
.manage-view-fade-leave-to {
    opacity: 0;
}

.manage-view-fade-enter-to,
.manage-view-fade-leave-from {
    opacity: 1;
}
</style>
