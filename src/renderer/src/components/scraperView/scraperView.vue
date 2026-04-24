<script lang="ts" setup>
import type { IFileItem } from './scraperView.hook/type'

import TextButton from '@renderer/components/control/button/textButton.vue'
import VirtualScroll from '@renderer/components/control/scroll/virtualScroll.vue'
import { videoExtensions } from '@renderer/helper'
import { globalStatesStore, settingsStore } from '@renderer/stores'
import Button from 'primevue/button'
import ContextMenu from 'primevue/contextmenu'
import Menu from 'primevue/menu'
import ProgressBar from 'primevue/progressbar'
import Select from 'primevue/select'
import { useDialog } from 'primevue/usedialog'
import { ref } from 'vue'

import {
    fileItemSize,
    useFileAppendRemove,
    useFileChecked,
    useFileContextMenu,
    useScraperStartCancel,
    useScraperViewMenu
} from './scraperView.hook'

const settings = settingsStore()
const globalStates = globalStatesStore()
const dialog = useDialog()
const fileInputRef = ref<HTMLInputElement | null>(null)
const fileList = ref<IFileItem[]>([])

const {
    isDragging,
    openFileSelect,
    handleFileSelect,
    handleDrop,
    handleDragEnter,
    handleDragLeave,
    removeFile,
    clearFiles
} = useFileAppendRemove(fileList, fileInputRef)

const { getFileDisable, isAllChecked, checkedFileList, toggleFileChecked, toggleAllFilesChecked } =
    useFileChecked(fileList)

const { fileItemContextMenuItems, showFileItemContextMenu } = useFileContextMenu()

const {
    scraperOptions,
    scraperMenuItems,
    showScraperMenu,
    showFileEditor,
    getNumText,
    getFileProgressColor,
    getFileTooltipText
} = useScraperViewMenu(dialog)

const { handleStart, handleCancel } = useScraperStartCancel(checkedFileList)
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
        <ContextMenu ref="fileItemContextMenu" :model="fileItemContextMenuItems" />
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

            <!-- 开始/取消按钮 -->
            <Button
                :loading="globalStates.scanFilesLoading && !globalStates.batchRunning"
                :icon="globalStates.batchRunning ? 'pi pi-times' : 'pi pi-search'"
                :label="globalStates.batchRunning ? '取消' : '开始刮削'"
                size="small"
                style="width: 7rem"
                @click="globalStates.batchRunning ? handleCancel() : handleStart()"
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
                    @contextmenu="(event) => showFileItemContextMenu(event, fileList[index])"
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
    height: 100%;
    padding-bottom: 0.75em;
}

.file-item {
    position: relative;
    overflow: hidden;
    border: 1px solid var(--p-content-border-color);
    border-radius: calc(var(--border-radius) * 2);
    height: 100%;
    transition: $transition;

    .file-item-container {
        width: 100%;
        height: 100%;
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
            background-color: hsl(0deg 0% 95% / 60%);
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
