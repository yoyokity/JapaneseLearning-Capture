<script lang="ts" setup>
import Scroll from '@renderer/components/control/scroll/scroll.vue'
import { PathHelper, videoExtensions } from '@renderer/helper'
import { AnimatePresence } from 'motion-v'
import Button from 'primevue/button'
import { ref } from 'vue'

interface IFileItem {
    path: string
    name: string
}

const fileList = ref<IFileItem[]>([])
const isDragging = ref(false)

/**
 * 判断文件是否为支持的视频格式
 * @param filePath 文件路径
 */
function isVideoFile(filePath: string) {
    const ext = PathHelper.newPath(filePath).extname.toLowerCase()
    return videoExtensions.includes(ext)
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
        if (!filePath || !isVideoFile(filePath)) continue

        nextFiles.push({
            path: filePath,
            name: file.name
        })
    }

    if (!nextFiles.length) return

    const fileMap = new Map(fileList.value.map((item) => [item.path, item]))
    for (const item of nextFiles) {
        fileMap.set(item.path, item)
    }

    fileList.value = Array.from(fileMap.values())
}

/**
 * 删除文件项
 * @param path 文件路径
 */
function removeFile(path: string) {
    fileList.value = fileList.value.filter((item) => item.path !== path)
}
</script>

<template>
    <div class="scraper-view">
        <div class="header">
            <h3>刮削</h3>
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
            <div class="drop-zone-title">拖入视频文件</div>
            <div class="drop-zone-desc">仅支持 {{ videoExtensions.join(' ') }}</div>
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
            <div class="file-list">
                <AnimatePresence>
                    <div v-for="item in fileList" :key="item.path" class="file-item">
                        <span class="file-name">{{ item.name }}</span>
                        <Button
                            icon="pi pi-times"
                            class="remove-button"
                            severity="secondary"
                            text
                            rounded
                            size="small"
                            @click="removeFile(item.path)"
                        />
                    </div>
                </AnimatePresence>
            </div>
        </Scroll>
    </div>
</template>

<style lang="scss" scoped>
.drop-zone {
    $padding: 3rem;
    $transition: all 0.4s var(--animation-type);

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
        font-size: 1.75rem;
        color: var(--p-text-color);
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
    background: var(--p-content-background);
    transition: all 0.4s var(--animation-type);
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
