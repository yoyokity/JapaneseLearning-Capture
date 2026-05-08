<script lang="ts" setup>
import type { ManageCardItem } from '@renderer/components/manageView/hook'
import type { IVideoFile } from '@renderer/scraper'
import type { SelectChangeEvent } from 'primevue/select'

import Scroll from '@renderer/components/control/scroll/scroll.vue'
import { useDisplay, useScanFiles } from '@renderer/components/manageView/hook'
import VideoCard from '@renderer/components/manageView/videoCard.vue'
import { PathHelper } from '@renderer/helper'
import { Scraper } from '@renderer/scraper'
import { globalStatesStore, settingsStore, VideoSortTypeList } from '@renderer/stores'
import Button from 'primevue/button'
import ContextMenu from 'primevue/contextmenu'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import ToggleButton from 'primevue/togglebutton'
import { onMounted, onUnmounted, ref } from 'vue'

const settings = settingsStore()
const globalStates = globalStatesStore()

const cm = ref()
const currentVideo = ref<IVideoFile | null>(null)
const isSortActive = ref(false)

const {
    hasManageViewFiles,
    displayItems,
    currentSet,
    isSetView,
    currentSortField,
    isPositiveOrder,
    manageViewFilesFilterValue,
    setManageViewFiles
} = useDisplay()

const { runScanFiles } = useScanFiles()

/**
 * 判断视频是否存在编号
 * @param video 视频
 */
function hasVideoNum(video: IVideoFile) {
    return Object.values(video.num || {}).some(
        (value) => typeof value === 'string' && value.trim() !== ''
    )
}

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

// 重新选择目录后，清除文件列表
function clearFiles(e: SelectChangeEvent) {
    if (e.value !== settings.currentScraper) {
        setManageViewFiles([])
        currentSet.value = null
    }
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
 * 处理鼠标返回
 */
function handleMouseBackAction(event: MouseEvent) {
    if (document.querySelector('.p-dialog-mask')) return
    if (!isSetView.value) return

    // 鼠标侧键返回
    if (event.button === 3) {
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

onMounted(() => {
    window.addEventListener('mouseup', handleMouseBackAction)
})

onUnmounted(() => {
    window.removeEventListener('mouseup', handleMouseBackAction)
})
</script>

<template>
    <div class="manage-view">
        <div class="tab-header">
            <!-- 左侧标题 -->
            <div class="tab-header-side">
                <h3 v-if="!isSetView">管理</h3>
                <div v-else class="manage-view-back-wrapper">
                    <i
                        v-tooltip.left="'返回'"
                        class="pi pi-arrow-left manage-view-back"
                        @click="backToHomeView"
                    />
                    <h3 class="manage-view-back-title">{{ currentSet }}</h3>
                </div>
            </div>

            <!-- 中间搜索和排序 -->
            <div class="tab-header-center">
                <div
                    v-show="hasManageViewFiles"
                    :class="{ active: isSortActive }"
                    class="manage-view-toolbar"
                >
                    <!-- 搜索 -->
                    <div class="search-input-container">
                        <i class="pi pi-search search-input-icon" />
                        <InputText
                            v-model="manageViewFilesFilterValue"
                            class="search-input"
                            placeholder="搜索"
                            size="small"
                        />
                    </div>

                    <!-- 排序 -->
                    <Select
                        v-model="currentSortField"
                        v-tooltip.top="'排序'"
                        :option-label="(option) => VideoSortTypeList[option]"
                        :options="Object.keys(VideoSortTypeList)"
                        class="sort-select"
                        dropdown-icon="pi pi-sort-amount-down"
                        size="small"
                        @hide="isSortActive = false"
                        @show="isSortActive = true"
                    >
                        <template #footer>
                            <!-- 排序方向 -->
                            <div style="padding: var(--p-select-list-padding)">
                                <ToggleButton
                                    v-model="isPositiveOrder"
                                    off-label="倒序"
                                    on-label="正序"
                                    size="small"
                                    style="width: 100%; transform: none !important"
                                />
                            </div>
                        </template>
                    </Select>
                </div>
            </div>

            <!-- 右侧操作 -->
            <div class="tab-header-side tab-header-actions">
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
                    style="width: 7rem; min-width: 7rem"
                    @click="runScanFiles(setManageViewFiles)"
                />
            </div>
        </div>
        <!-- TODO 添加标签筛选 -->
        <Scroll
            style="height: calc(100% - var(--header-height))"
            occupy-space="none"
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
                            :file-num="item.type === 'series' ? item.files.length : undefined"
                            :has-video-num="
                                item.type === 'series'
                                    ? item.files.every((video: IVideoFile) => hasVideoNum(video))
                                    : hasVideoNum(item.video)
                            "
                            :on-click="
                                item.type === 'series'
                                    ? (_, event) => {
                                          handleCardClick(item, event)
                                      }
                                    : undefined
                            "
                            @contextmenu="(event: MouseEvent) => handleCardContextmenu(item, event)"
                        />
                    </template>
                </div>
            </transition>
        </Scroll>

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

.tab-header-side {
    flex: 1;
    display: flex;
    align-items: center;
    min-width: 0;
}

.tab-header-actions {
    justify-content: flex-end;
    gap: 0.5rem;
}

.manage-view-back-wrapper {
    margin-right: auto;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;

    h3 {
        margin: 0;
        font-weight: normal;
        pointer-events: none;
        color: inherit;
    }
}

.manage-view-back-title {
    transform: translate(0.5rem, -1px);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding-right: 2rem;
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

.tab-header-center {
    display: flex;
    justify-content: center;
    flex: 0 0 auto;
}

.manage-view-toolbar {
    width: fit-content;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 0.5rem;
    height: 2rem;
    transform: translateX(-2rem);

    .search-input-container {
        width: 15rem;
        height: 2rem;
        position: relative;

        .search-input-icon {
            position: absolute;
            left: 0.75rem;
            top: 50%;
            transform: translateY(-50%);
            color: var(--p-text-muted-color);
            font-size: 0.75rem;
            pointer-events: none;
            z-index: 1;
        }

        .search-input {
            width: 100%;
            height: 100%;
            border-radius: 10rem;
            padding-left: 2rem;
        }
    }

    .sort-select {
        --p-icon-size: calc(1rem + 2px);
        --p-select-dropdown-width: 100%;
        --p-select-dropdown-color: var(--p-text-muted-color);

        width: 2rem;
        border: none !important;
        background: transparent !important;
        transition: color 0.3s var(--animation-type);

        :deep(.p-select-label) {
            display: none;
        }

        &:hover {
            --p-select-dropdown-color: var(--p-primary-color);
        }
    }
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
