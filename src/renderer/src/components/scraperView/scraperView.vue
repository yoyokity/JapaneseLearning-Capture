<script lang="ts" setup>
import type { Path } from '@renderer/helper'
import type { MenuItem } from 'primevue/menuitem'

import Scroll from '@renderer/components/control/scroll/scroll.vue'
import { PathHelper, videoExtensions } from '@renderer/helper'
import { Scraper } from '@renderer/scraper'
import { globalStatesStore, settingsStore } from '@renderer/stores'
import { AnimatePresence } from 'motion-v'
import Button from 'primevue/button'
import Menu from 'primevue/menu'
import Select from 'primevue/select'
import { computed, ref } from 'vue'

const settings = settingsStore()
const globalStates = globalStatesStore()
const scraperOptions = Scraper.instances.map((scraper) => scraper.scraperName)
const scraperMenu = ref()
const currentMenuItem = ref<IFileItem | null>(null)

interface IFileItem {
    /** 文件路径 */
    file: Path
    /** 刮削器名称 */
    scraper: string
}

const fileList = ref<IFileItem[]>([])
const isDragging = ref(false)

/**
 * 刮削器菜单项
 */
const scraperMenuItems = computed<MenuItem[]>(() =>
    scraperOptions.map((scraperName) => ({
        label: scraperName,
        command: () => {
            if (currentMenuItem.value) {
                currentMenuItem.value.scraper = scraperName
            }
        }
    }))
)

/**
 * 判断文件是否为支持的视频格式
 * @param filePath 文件路径
 */
function isVideoFile(filePath: Path) {
    const ext = filePath.extname.toLowerCase()
    return Object.keys(videoExtensions).includes(ext)
}

/**
 * 获取文件类型图标背景色
 * @param filePath 文件路径
 */
function getFileExtColor(filePath: Path) {
    const ext = filePath.extname.toLowerCase()
    return videoExtensions[ext] || 'var(--p-text-muted-color)'
}

/**
 * 处理拖拽进入和悬停状态
 */
function handleDragEnter() {
    isDragging.value = true
}

/**
 * 处理拖拽离开状态
 * @param e 拖拽事件
 */
function handleDragLeave(e: DragEvent) {
    if (!(e.currentTarget instanceof HTMLElement)) return
    if (e.currentTarget.contains(e.relatedTarget as Node)) return

    isDragging.value = false
}

/**
 * 处理文件拖入
 * @param e 拖放事件
 */
async function handleDrop(e: DragEvent) {
    e.preventDefault()
    isDragging.value = false

    const files = Array.from(e.dataTransfer?.files || [])
    if (!files.length) return

    const nextFiles: IFileItem[] = []

    for (const file of files) {
        const filePath = await PathHelper.getPathForFile(file)
        if (!filePath) continue

        const path = PathHelper.newPath(filePath)
        if (!isVideoFile(path)) continue

        nextFiles.push({
            file: path,
            scraper: settings.currentScraper
        })
    }

    if (!nextFiles.length) return

    const fileMap = new Map(fileList.value.map((item) => [item.file.toString(), item]))
    for (const item of nextFiles) {
        fileMap.set(item.file.toString(), item)
    }

    fileList.value = Array.from(fileMap.values())
}

/**
 * 删除文件项
 * @param path 文件路径
 */
function removeFile(path: Path) {
    fileList.value = fileList.value.filter((item) => item.file.toString() !== path.toString())
}

/**
 * 清空文件列表
 */
function clearFiles() {
    fileList.value = []
}

/**
 * 打开刮削器选择菜单
 * @param event 鼠标事件
 * @param item 当前文件项
 */
function showScraperMenu(event: MouseEvent, item: IFileItem) {
    currentMenuItem.value = item
    scraperMenu.value?.toggle?.(event)
}
</script>

<template>
    <div class="scraper-view">
        <div class="tab-header">
            <h3 v-if="fileList.length === 0">刮削</h3>

            <!-- 控制台 -->
            <div v-else style="margin-right: auto">
                <Button
                    v-tooltip.right="'清空所有文件'"
                    icon="pi pi-trash"
                    severity="secondary"
                    text
                    @click="clearFiles"
                />
            </div>

            <Select
                v-model="settings.currentScraper"
                v-tooltip.left="'选择刮削器'"
                :options="scraperOptions"
                size="small"
                style="width: 8rem"
            />
            <Button
                :loading="globalStates.scanFilesLoading"
                icon="pi pi-search"
                label="开始刮削"
                size="small"
                style="width: 7rem"
            />
        </div>

        <!-- 拖入文件区域 -->
        <div
            v-if="fileList.length === 0"
            class="drop-zone"
            :class="{ dragging: isDragging }"
            @dragover.prevent
            @drop.prevent="handleDrop"
            @dragenter.prevent="handleDragEnter"
            @dragleave.prevent="handleDragLeave"
        >
            <i class="pi pi-cloud-upload drop-zone-icon"></i>
            <div class="drop-zone-title">拖入要刮削的视频</div>
            <div class="drop-zone-desc">仅支持 {{ Object.keys(videoExtensions).join(' ') }}</div>
        </div>

        <!-- 列表 -->
        <Scroll
            v-else
            style="height: calc(100% - var(--header-height))"
            :scrollbar-occupy-space="false"
            @dragover.prevent
            @drop.prevent="handleDrop"
            @dragenter.prevent="handleDragEnter"
            @dragleave.prevent="handleDragLeave"
        >
            <Menu ref="scraperMenu" :model="scraperMenuItems" popup />
            <div class="file-list">
                <AnimatePresence>
                    <div v-for="item in fileList" :key="item.file.toString()" class="file-item">
                        <div class="file-main">
                            <span
                                class="file-ext-icon"
                                :style="{ backgroundColor: getFileExtColor(item.file) }"
                            >
                                {{ item.file.extname.replace('.', '').toUpperCase() }}
                            </span>
                            <span class="file-name">{{ item.file.basename }}</span>
                        </div>
                        <div class="file-actions">
                            <Button
                                :label="item.scraper"
                                class="scraper-button"
                                severity="secondary"
                                size="small"
                                text
                                @click="showScraperMenu($event, item)"
                            />
                            <Button
                                icon="pi pi-times"
                                class="remove-button"
                                severity="secondary"
                                text
                                rounded
                                size="small"
                                @click="removeFile(item.file)"
                            />
                        </div>
                    </div>
                </AnimatePresence>
            </div>
        </Scroll>
    </div>
</template>

<style lang="scss" scoped>
$transition: all 0.4s var(--animation-type);

.drop-zone {
    $padding: 3rem;

    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding-bottom: calc($padding * 2);
    height: calc(100% - var(--header-height) - $padding * 2);
    margin: $padding;
    border: 2px dashed var(--p-content-border-color);
    border-radius: calc(var(--border-radius) * 2);
    background: var(--p-content-background);
    text-align: center;
    transition: $transition;

    &.dragging {
        border-color: var(--p-primary-active-color);
        background: var(--p-surface-100);

        .drop-zone-icon,
        .drop-zone-title {
            color: var(--p-primary-active-color);
        }
    }

    .drop-zone-icon {
        font-size: 3rem;
        color: var(--p-text-muted-color);
        margin-bottom: 0.75rem;
        transition: $transition;
    }

    .drop-zone-title {
        font-size: 1rem;
        font-weight: 600;
        color: var(--p-text-color);
        transition: $transition;
    }

    .drop-zone-desc {
        margin-top: 0.5rem;
        font-size: 0.875rem;
        color: var(--p-text-muted-color);
    }
}

.file-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1rem;
}

.file-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.75rem 1rem;
    border: 1px solid var(--p-content-border-color);
    border-radius: calc(var(--border-radius) * 2);
    background-color: var(--p-surface-100);
    transition: $transition;
}

.file-main {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 1;
    min-width: 0;
}

.file-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
}

.scraper-button {
    padding: 0.35rem 0.75rem !important;
    border-radius: 999px !important;
    background-color: var(--p-content-background) !important;
    border: 1px solid var(--p-content-border-color) !important;
    transition: $transition;
}

.scraper-button:hover,
.scraper-button:active {
    color: var(--p-primary-color) !important;
    border-color: var(--p-primary-color) !important;
    background-color: var(--p-primary-50) !important;
}

.file-ext-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 50%;
    font-size: 0.625rem;
    font-weight: 700;
    line-height: 1;
    color: #fff;
    text-transform: uppercase;
}

.file-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--p-text-color);
}

.remove-button:hover,
.remove-button:active {
    color: var(--p-primary-color) !important;
}
</style>
