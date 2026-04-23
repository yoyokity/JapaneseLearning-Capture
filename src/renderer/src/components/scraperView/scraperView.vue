<script lang="ts" setup>
import type { Path } from '@renderer/helper'
import type { ScraperState } from '@renderer/scraper/hooks/type'
import type { MenuItem } from 'primevue/menuitem'

import TextButton from '@renderer/components/control/button/textButton.vue'
import { useMessage } from '@renderer/components/control/message'
import VirtualScroll from '@renderer/components/control/scroll/virtualScroll.vue'
import FileItemEditor from '@renderer/components/scraperView/fileItemEditor.vue'
import { PathHelper, TaskHelper, videoExtensions } from '@renderer/helper'
import { Scraper } from '@renderer/scraper'
import { useBatchScraper } from '@renderer/scraper/hooks/useBatchScraper'
import { globalStatesStore, settingsStore } from '@renderer/stores'
import { cloneDeep } from 'es-toolkit'
import Button from 'primevue/button'
import Menu from 'primevue/menu'
import ProgressBar from 'primevue/progressbar'
import Select from 'primevue/select'
import { useDialog } from 'primevue/usedialog'
import { computed, ref } from 'vue'

interface IFileItem {
    /** 文件路径 */
    file: Path
    /** 标题 */
    title: string
    /** 编号 */
    num: Record<string, string>
    /** 是否参与刮削 */
    checked: boolean
    /** 文件类型颜色 */
    extColor: string
    /** 刮削器名称 */
    scraper: string
    /** 进度 */
    progress: number
    /** 刮削状态 */
    scraperState: ScraperState | null
    /** 刮削状态文本 */
    scraperStateText?: string
}

const settings = settingsStore()
const globalStates = globalStatesStore()
const dialog = useDialog()
const message = useMessage()
const { scraperRun } = useBatchScraper()

const scraperOptions = Scraper.instances.map((scraper) => scraper.scraperName)
const scraperMenu = ref()
const currentMenuItem = ref<IFileItem | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)

const fileItemSize = 78
const fileList = ref<IFileItem[]>([])
const fileItemStateColorMap: Record<ScraperState, string> = {
    error: 'var(--error-color)',
    warn: 'var(--warning-color)',
    success: 'var(--success-color)'
}

const isAllChecked = computed(
    () => fileList.value.length > 0 && fileList.value.every((item) => item.checked)
)

/**
 * 需要刮削的文件列表
 */
const checkedFileList = computed(() =>
    fileList.value.filter((item) => item.checked && item.progress <= 0)
)

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
 * 获取编号展示文本
 * @param item 文件项
 */
function getNumText(item: IFileItem) {
    return Object.entries(item.num)
        .map(([key, value]) => `${key}:${value}`)
        .join(',  ')
}

/**
 * 获取进度条颜色
 * @param item 文件项
 */
function getFileProgressColor(item: IFileItem) {
    return item.scraperState ? fileItemStateColorMap[item.scraperState] : item.extColor
}

/**
 * 获取文件提示文本
 * @param item 文件项
 */
function getFileTooltipText(item: IFileItem) {
    if (item.scraperState === null || item.scraperState === 'success') {
        return undefined
    }

    return `${item.scraperState === 'error' ? '失败' : '提示'}：\n ${item.scraperStateText}`
}

/**
 * 获取文件item禁用状态
 * @description 开始刮削后，所有文件都禁用；刮削完成的文件禁用
 * @param item 文件项
 */
function getFileDisable(item: IFileItem) {
    // 开始刮削后，所有文件都禁用
    if (globalStates.batchRunning) {
        return true
    }

    if (item.scraperState === null && item.progress <= 0) {
        return false
    }

    // 刮削完成的文件禁用
    return true
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
 * 添加文件到列表
 * @param files 文件列表
 */
async function appendFiles(files: File[]) {
    if (!files.length) return

    const nextFiles: IFileItem[] = []

    for (const file of files) {
        const filePath = await PathHelper.getPathForFile(file)
        if (!filePath) continue

        const path = PathHelper.newPath(filePath)
        if (!isVideoFile(path)) continue

        nextFiles.push({
            file: path,
            title: path.basename,
            num: {},
            checked: true,
            extColor: getFileExtColor(path),
            scraper: settings.currentScraper,
            progress: 0,
            scraperState: null
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
 * 打开文件选择窗口
 */
function openFileSelect() {
    fileInputRef.value?.click()
}

/**
 * 处理文件选择
 * @param e 选择事件
 */
async function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement
    const files = Array.from(input.files || [])

    await appendFiles(files)

    input.value = ''
}

/**
 * 处理文件拖入
 * @param e 拖放事件
 */
async function handleDrop(e: DragEvent) {
    e.preventDefault()
    isDragging.value = false

    const files = Array.from(e.dataTransfer?.files || [])

    await appendFiles(files)
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
 * 切换文件选中状态
 * @param item 文件项
 */
function toggleFileChecked(item: IFileItem) {
    item.checked = !item.checked
}

/**
 * 切换全部文件选中状态
 */
function toggleAllFilesChecked() {
    const nextChecked = !isAllChecked.value
    fileList.value.forEach((item) => {
        item.checked = nextChecked
    })
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

/**
 * 打开文件信息编辑窗口
 * @param item 文件项
 */
function showFileEditor(item: IFileItem) {
    dialog.open(FileItemEditor, {
        props: {
            modal: true,
            draggable: false,
            showHeader: false,
            style: {
                width: 'fit-content',
                maxWidth: '90vw'
            },
            header: '信息编辑'
        },
        data: {
            scraperName: item.scraper,
            title: item.title,
            num: { ...item.num }
        },
        onClose: (options) => {
            const data = options?.data
            if (!data) return

            item.title = data.title || item.file.basename
            item.num = data.num || {}
        }
    })
}

/**
 * 开始刮削
 */
async function handleStart() {
    if (!checkedFileList.value.length) {
        message.toast.info('没有需要刮削的文件')
        return
    }

    globalStates.batchRunning = true
    globalStates.batchScrapedCount = 0
    globalStates.batchTotalCount = checkedFileList.value.length

    // 遍历所有需要刮削的文件
    for (const file of checkedFileList.value) {
        await TaskHelper.queueWithInterval('scraper-batch-all', 0, true, async () => {
            // 刮削单个文件
            const { scraperState, scraperStateText } = await scraperRun(
                cloneDeep({
                    title: file.title,
                    num: file.num
                }),
                file.file,
                file.scraper,
                (progress) => {
                    file.progress = progress
                }
            )

            // 更新文件状态
            file.scraperState = scraperState
            file.scraperStateText = scraperStateText

            // 更新批量刮削进度
            globalStates.batchScrapedCount += 1
        })
    }

    globalStates.batchRunning = false
}
</script>

<template>
    <div class="scraper-view">
        <input
            ref="fileInputRef"
            type="file"
            multiple
            hidden
            :accept="Object.keys(videoExtensions).join(',')"
            @change="handleFileSelect"
        />
        <Menu ref="scraperMenu" :model="scraperMenuItems" popup />
        <div class="tab-header">
            <!-- 控制台 -->
            <div style="margin-right: auto">
                <TextButton
                    v-tooltip.right="'添加文件'"
                    icon="pi pi-plus"
                    :disabled="globalStates.batchRunning"
                    @click="openFileSelect"
                />
                <TextButton
                    v-if="fileList.length !== 0"
                    v-tooltip.right="'清空所有文件'"
                    icon="pi pi-trash"
                    :disabled="globalStates.batchRunning"
                    @click="clearFiles"
                />
                <TextButton
                    v-if="fileList.length !== 0"
                    v-tooltip.right="isAllChecked ? '全部不选' : '全部选中'"
                    :icon="isAllChecked ? 'pi pi-check-circle' : 'pi pi-circle'"
                    :disabled="globalStates.batchRunning"
                    @click="toggleAllFilesChecked"
                />
            </div>

            <Select
                v-model="settings.currentScraper"
                v-tooltip.left="'选择刮削器'"
                :options="scraperOptions"
                size="small"
                style="width: 8rem"
                :disabled="globalStates.batchRunning"
            />
            <Button
                :loading="globalStates.scanFilesLoading"
                icon="pi pi-search"
                label="开始刮削"
                size="small"
                style="width: 7rem"
                @click="handleStart"
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
        <VirtualScroll
            v-else
            style="height: calc(100% - var(--header-height))"
            :item-count="fileList.length"
            :item-size="fileItemSize"
            :content-css="{ padding: '1rem' }"
            :scrollbar-occupy-space="false"
            @dragover.prevent
            @drop.prevent="handleDrop"
            @dragenter.prevent="handleDragEnter"
            @dragleave.prevent="handleDragLeave"
        >
            <template #default="{ index }">
                <div
                    v-tooltip.top="{
                        value: getFileTooltipText(fileList[index]),
                        showDelay: 0,
                        hideDelay: 0,
                        pt: {
                            arrow: {
                                style: {
                                    display: 'block !important'
                                }
                            },
                            text: {
                                style: {
                                    color: getFileProgressColor(fileList[index]),
                                    padding: '1em 1.5em',
                                    fontSize: 'calc(1rem - 2px)'
                                }
                            }
                        }
                    }"
                    class="file-item-shell"
                    :style="{
                        cursor: getFileTooltipText(fileList[index]) ? 'pointer' : 'default'
                    }"
                >
                    <div class="file-item">
                        <div
                            class="file-item-container"
                            :class="{
                                'file-item-container-disabled': getFileDisable(fileList[index])
                            }"
                        >
                            <i
                                class="check-icon pi"
                                :class="[fileList[index].checked ? 'pi-check-circle' : 'pi-circle']"
                                :style="{ '--check-icon-color': fileList[index].extColor }"
                                role="button"
                                tabindex="0"
                                @click="toggleFileChecked(fileList[index])"
                                @keydown.enter="toggleFileChecked(fileList[index])"
                                @keydown.space.prevent="toggleFileChecked(fileList[index])"
                            />
                            <div class="file-main">
                                <span
                                    class="file-ext-icon"
                                    :style="{ backgroundColor: fileList[index].extColor }"
                                >
                                    {{
                                        fileList[index].file.extname.replace('.', '').toUpperCase()
                                    }}
                                </span>
                                <div class="file-info">
                                    <TextButton
                                        v-tooltip.top="'点击修改标题或编号'"
                                        :label="fileList[index].title"
                                        class="file-name-button"
                                        @click="showFileEditor(fileList[index])"
                                    />
                                    <div
                                        v-if="Object.keys(fileList[index].num).length"
                                        class="file-num"
                                    >
                                        {{ getNumText(fileList[index]) }}
                                    </div>
                                </div>
                            </div>
                            <div class="file-actions">
                                <!-- 单项选择刮削器按钮 -->
                                <Button
                                    v-tooltip.top="'修改当前视频的刮削器'"
                                    :label="fileList[index].scraper"
                                    class="scraper-button"
                                    severity="secondary"
                                    size="small"
                                    text
                                    @click="showScraperMenu($event, fileList[index])"
                                />
                            </div>
                        </div>

                        <!-- 删除按钮 -->
                        <TextButton
                            class="remove-button"
                            icon="pi pi-times"
                            :disabled="globalStates.batchRunning"
                            @click="removeFile(fileList[index].file)"
                        />

                        <ProgressBar
                            :value="fileList[index].progress"
                            :show-value="false"
                            class="file-progress"
                            :style="{
                                '--file-progress-color': getFileProgressColor(fileList[index])
                            }"
                        />
                    </div>
                </div>
            </template>
        </VirtualScroll>
    </div>
</template>

<style lang="scss" scoped>
$transition: all 0.4s var(--animation-type);
$remove-button-width: 3rem;

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

.file-item-shell {
    box-sizing: border-box;
    height: fit-content;
    margin-bottom: 0.75em;
}

.file-item {
    position: relative;
    overflow: hidden;
    border: 1px solid var(--p-content-border-color);
    border-radius: calc(var(--border-radius) * 2);
    transition: $transition;

    .file-item-container {
        width: 100%;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        padding: 0.75rem 1rem;
        padding-right: 0;
        background-color: var(--p-surface-100);
        transition: $transition;
    }

    .remove-button {
        height: 100%;
        width: $remove-button-width;
        position: absolute;
        right: 0;
        top: 0;
    }

    .file-item-container-disabled {
        pointer-events: none;

        &::after {
            content: '';
            position: absolute;
            inset: 0;
            background-color: hsl(0deg 0 95% / 60%);
        }
    }
}

.file-main {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 1;
    min-width: 0;
}

.file-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 0;
}

.file-name-button {
    justify-content: flex-start !important;
    padding: 0 !important;
    color: var(--p-text-color) !important;
    min-width: 0;
    max-width: 100%;
}

.file-name-button:deep(.p-button-label) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
}

.file-num {
    font-size: 0.75rem;
    color: var(--p-text-muted-color);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.file-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
    margin-right: $remove-button-width;
}

.check-icon {
    flex-shrink: 0;
    font-size: 1.1rem;
    color: var(--check-icon-color);
    cursor: pointer;
    transition: $transition;
}

.check-icon:hover,
.check-icon:active,
.check-icon:focus-visible {
    color: var(--p-primary-color);
}

.check-icon:focus-visible {
    outline: none;
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

.file-progress {
    position: absolute;
    right: 0;
    left: 0;
    border-radius: 0;
    background: transparent;
    bottom: -1px;
    height: 4px;
}

.file-progress:deep(.p-progressbar-value) {
    background: var(--file-progress-color);
}

.file-progress:deep(.p-progressbar-label) {
    display: none;
}
</style>
