<script lang="ts" setup>
import type { ManageCardItem } from '@renderer/components/manageView/hook'
import type { IVideoFile } from '@renderer/scraper'
import type { SelectChangeEvent } from 'primevue/select'

import TextButton from '@renderer/components/control/button/textButton.vue'
import { useMessage } from '@renderer/components/control/message'
import Scroll from '@renderer/components/control/scroll/scroll.vue'
import { useDisplay, useScanFiles } from '@renderer/components/manageView/hook'
import VideoCard from '@renderer/components/manageView/videoCard.vue'
import { PathHelper } from '@renderer/helper'
import { Scraper } from '@renderer/scraper'
import { globalStatesStore, settingsStore, VideoSortTypeList } from '@renderer/stores'
import { delay } from 'es-toolkit'
import Button from 'primevue/button'
import ContextMenu from 'primevue/contextmenu'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import ToggleButton from 'primevue/togglebutton'
import ToggleSwitch from 'primevue/toggleswitch'
import { onMounted, onUnmounted, ref } from 'vue'

const { runScanFiles } = useScanFiles()
const display = useDisplay()
const settings = settingsStore()
const globalStates = globalStatesStore()
const message = useMessage()

const cm = ref()
const currentVideo = ref<IVideoFile | null>(null)
const isSortActive = ref(false)

// 筛选面板
type FilterPanel = 'tag' | 'sort'
const activeFilterPanel = ref<FilterPanel | null>(null)
function toggleFilterPanel(panel: FilterPanel) {
    activeFilterPanel.value = activeFilterPanel.value === panel ? null : panel
}

/**
 * 切换标签选中状态
 * @param tag 标签
 */
function toggleCurrentTag(tag: string) {
    if (display.currentTagField.includes(tag)) {
        display.currentTagField = display.currentTagField.filter((value) => value !== tag)
        return
    }

    display.currentTagField.push(tag)
}

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
                PathHelper.openInExplorer(currentVideo.value.path)
            }
        }
    },
    {
        label: '打开文件夹',
        icon: 'pi pi-folder-open',
        command: () => {
            if (currentVideo.value) {
                PathHelper.openInExplorer(currentVideo.value.dir)
            }
        }
    },
    {
        label: '移动到回收站',
        icon: 'pi pi-trash',
        command: () => {
            if (currentVideo.value)
                message.confirmDialog.yesOrNo('确认移动到回收站吗？', async () => {
                    if (currentVideo.value) {
                        await PathHelper.remove(currentVideo.value.dir)
                        await delay(100)
                        runScanFiles()
                    }
                })
        }
    }
])

// 重新选择目录后，清除文件列表
function clearFiles(e: SelectChangeEvent) {
    if (e.value !== settings.currentScraper) {
        display.setManageViewFiles([])
        display.currentSetField = null
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
 * 回到主页视角
 */
function backToHomeView() {
    display.currentSetField = null
    hideMenuOnScroll()
}

/**
 * 处理鼠标返回
 */
function handleMouseBackAction(event: MouseEvent) {
    if (document.querySelector('.p-dialog-mask')) return
    if (!display.isSetView) return

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
        display.currentSetField = item.name
        hideMenuOnScroll()
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
                <h3 v-if="!display.isSetView">管理</h3>
                <div v-else class="manage-view-back-wrapper">
                    <i
                        v-tooltip.left="'返回'"
                        class="pi pi-arrow-left manage-view-back"
                        @click="backToHomeView"
                    />
                    <h3 class="manage-view-back-title">{{ display.currentSetField }}</h3>
                </div>
            </div>

            <!-- 中间搜索和排序 -->
            <div class="tab-header-center">
                <div
                    v-show="display.hasManageViewFiles"
                    :class="{ active: isSortActive }"
                    class="manage-view-toolbar"
                >
                    <!-- 搜索 -->
                    <div class="search-input-container">
                        <i class="pi pi-search search-input-icon" />
                        <InputText
                            v-model="display.manageViewFilesFilterValue"
                            class="search-input"
                            placeholder="搜索"
                            size="small"
                        />
                    </div>

                    <!-- 排序 -->
                    <Select
                        v-model="settings.manageViewSort"
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
                                    v-model="display.isPositiveOrder"
                                    off-label="倒序"
                                    on-label="正序"
                                    size="small"
                                    style="width: 100%; transform: none !important"
                                />
                            </div>
                        </template>
                    </Select>

                    <!-- 标签筛选 -->
                    <TextButton
                        v-tooltip.top="'标签筛选'"
                        icon="pi pi-tags"
                        class="active-button"
                        :class="{
                            active: activeFilterPanel === 'tag'
                        }"
                        @click="toggleFilterPanel('tag')"
                    />
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
                    @click="runScanFiles"
                />
            </div>
        </div>

        <!-- 筛选面板 -->
        <transition name="filter-panel-fade">
            <div v-if="activeFilterPanel" class="filter-panel">
                <div class="filter-panel-content">
                    <!-- 标签 -->
                    <Scroll style="height: calc(100% - 4rem)" occupy-space="none">
                        <div v-if="activeFilterPanel === 'tag'" class="tag-list">
                            <!-- 标签项 -->
                            <div
                                v-for="item in display.tagsList"
                                :key="item.tag"
                                :class="{
                                    active: display.currentTagField.includes(item.tag)
                                }"
                                class="tag-item"
                                @click="toggleCurrentTag(item.tag)"
                            >
                                <span class="tag-item-label">{{ item.tag }}</span>
                            </div>
                        </div>
                    </Scroll>
                    <!-- 匹配按钮 -->
                    <div class="tag-footer">
                        <span>所有标签都包含</span>
                        <ToggleSwitch v-model="settings.manageViewTagsMatchAll" />
                    </div>
                </div>
            </div>
        </transition>

        <Scroll
            style="height: calc(100% - var(--header-height))"
            occupy-space="none"
            @touchmove="hideMenuOnScroll"
            @wheel.capture="hideMenuOnScroll"
        >
            <transition mode="out-in" name="manage-view-fade">
                <div :key="display.currentSetField || 'home'" class="manage-view-content">
                    <!-- 卡片视图 -->
                    <template
                        v-for="item in display.displayItems"
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

.active-button {
    &:hover {
        --hover-color: none !important;
    }

    &.active {
        color: var(--p-primary-color) !important;
    }
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
        --p-select-dropdown-width: var(--p-button-icon-only-width);
        --p-select-dropdown-color: var(--p-button-text-secondary-color);

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

.filter-panel {
    position: absolute;
    height: calc(100% - var(--header-height));
    padding: 1rem 0.5rem;
    top: var(--header-height);
    left: 0;
    z-index: 2;
    transition: opacity 0.3s var(--animation-type);

    width: 22rem;
    @media (min-width: 1600px) {
        width: 35rem;
    }
    @media (min-width: 1200px) and (max-width: 1600px) {
        width: 28rem;
    }
    @media (max-width: 1200px) {
        width: 22rem;
    }

    opacity: 0.7;
    &:hover {
        opacity: 1;
    }

    .filter-panel-content {
        height: 100%;
        background-color: var(--p-surface-0);
        box-shadow: 0 0px 8px rgba(0, 0, 0, 0.1);
        border: var(--separator);
        border-radius: 1rem;
        overflow: hidden;

        .tag-list {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
            padding: 1rem;

            .tag-item {
                width: fit-content;
                display: inline-flex;
                align-items: center;
                gap: 2px;
                padding: 0.45rem 0.85rem;
                border: 1px solid var(--p-content-border-color);
                border-radius: 999rem;
                background-color: var(--p-surface-0);
                color: inherit;
                cursor: pointer;
                transition: all 0.3s var(--animation-type);

                &.active {
                    border-color: var(--p-primary-color);
                    background-color: var(--p-primary-color);
                    color: var(--p-primary-inverse-color);
                }

                .tag-item-label {
                    font-size: 0.9rem;
                    line-height: 1;
                }
            }
        }

        .tag-footer {
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 1rem 1.5rem;
            height: 4rem;
        }
    }
}

// 筛选面板切换动画
.filter-panel-fade-enter-active,
.filter-panel-fade-leave-active {
    transition: transform 0.3s var(--animation-type);
}

.filter-panel-fade-enter-from,
.filter-panel-fade-leave-to {
    transform: translateX(-100%);
}

.filter-panel-fade-enter-to,
.filter-panel-fade-leave-from {
    transform: translateX(0);
}

// 系列页面切换动画
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
