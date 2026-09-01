<script lang="ts" setup>
import type { StyleValue } from 'vue'

import TextButton from '@renderer/components/control/button/textButton.vue'
import InputLine from '@renderer/components/control/inputLine/inputLine.vue'
import { usePreviewImage } from '@renderer/components/control/previewImage'
import Scroll from '@renderer/components/control/scroll/scroll.vue'
import VideoImage from '@renderer/components/control/videoImage.vue'
import { toolsStore } from '@renderer/components/toolsView/toolsStore'
import { imgExtnames, LogHelper, MediaHelper, PathHelper } from '@renderer/helper'
import { globalStatesStore } from '@renderer/stores'
import { storeToRefs } from 'pinia'
import Button from 'primevue/button'
import ProgressBar from 'primevue/progressbar'
import Select from 'primevue/select'
import { useToast } from 'primevue/usetoast'
import { v7 } from 'uuid'
import { computed, ref, watch } from 'vue'

interface ImageItem {
    path: string
    /** 超分前的原图快照路径，用于与结果对比 */
    originalSnapshot: string | null
    /** 是否已完成超分 */
    superResolved: boolean
}

/** 图片预览样式：完整居中显示并保留圆角 */
const containImageStyle = {
    objectFit: 'contain',
    width: 'auto',
    height: 'auto',
    maxWidth: '100%',
    maxHeight: '100%',
    display: 'block',
    borderRadius: 'calc(var(--border-radius) * 2)'
} satisfies StyleValue

const logger = LogHelper.title('tool').title('图片超分')

const toast = useToast()
const globalStates = globalStatesStore()
const { pendingSuperResolution, superResolutionModelName } = storeToRefs(toolsStore())
const { setPreviewImage, setPreviewImageDiff } = usePreviewImage()

const images = ref<ImageItem[]>([])
const isDragging = ref(false)
const running = ref(false)
const progress = ref(0)
const fileInputRef = ref<HTMLInputElement | null>(null)

/** 当前唯一图片（单张模式时使用） */
const currentItem = computed(() => images.value[0] ?? null)

/** 弹出结果提示 */
function notify(severity: 'success' | 'info' | 'warn' | 'error', summary: string, detail?: string) {
    toast.add({ severity, summary, detail, life: 3000 })
}

/** 构造列表项 */
function newImageItem(path: string): ImageItem {
    return { path, originalSnapshot: null, superResolved: false }
}

/** 添加文件：单张且当前不多于一张时替换，否则追加 */
async function addFiles(files: File[]) {
    if (running.value || !files.length) return

    const paths: string[] = []
    for (const file of files) {
        const filePath = await PathHelper.getPathForFile(file)
        if (filePath && imgExtnames.includes(PathHelper.newPath(filePath).extname.toLowerCase())) {
            paths.push(filePath)
        }
    }
    if (!paths.length) return

    // 过滤掉已在列表中的重复文件（相同路径不重复添加）
    const existing = new Set(images.value.map((item) => item.path))
    const newPaths = paths.filter((path) => !existing.has(path))
    if (!newPaths.length) return

    if (newPaths.length === 1 && images.value.length <= 1) {
        images.value = [newImageItem(newPaths[0])]
    } else {
        images.value.push(...newPaths.map(newImageItem))
    }
}

/** 打开文件选择窗口 */
function openFileSelect() {
    if (running.value) return
    fileInputRef.value?.click()
}

/** 清空图片列表 */
function clearAll() {
    if (running.value) return
    images.value = []
}

/** 处理文件选择 */
async function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement
    const files = Array.from(input.files ?? [])
    input.value = ''

    await addFiles(files)
}

/** 处理文件拖入 */
async function handleDrop(e: DragEvent) {
    e.preventDefault()
    isDragging.value = false

    await addFiles(Array.from(e.dataTransfer?.files ?? []))
}

/** 处理拖拽进入 */
function handleDragEnter() {
    isDragging.value = true
}

/** 处理拖拽离开 */
function handleDragLeave(e: DragEvent) {
    if (!(e.currentTarget instanceof HTMLElement)) return
    if (e.currentTarget.contains(e.relatedTarget as Node)) return

    isDragging.value = false
}

/** 打开超分模型目录 */
function openModelPath() {
    PathHelper.openInExplorer(PathHelper.arsrPath.extraResource.join('tools/image-polish/models'))
}

/** 打开当前图片所在目录 */
function openImagePath() {
    if (!currentItem.value) return
    PathHelper.openInExplorer(PathHelper.newPath(currentItem.value.path).parent)
}

/** 点击图片预览：已超分时展示前后对比，否则单图预览 */
function previewClick(item: ImageItem) {
    if (item.superResolved && item.originalSnapshot) {
        setPreviewImageDiff({ before: item.originalSnapshot, after: item.path })
    } else {
        setPreviewImage(item.originalSnapshot || item.path)
    }
}

/** 开始超分：一次性批量处理未超分图片（主进程按完成张数推送进度），结果直接覆盖源文件（需要原图时用「还原原图」从快照恢复） */
async function startSuperResolution() {
    if (running.value || !images.value.length || !superResolutionModelName.value) return

    // 只处理尚未超分的图片
    const pending = images.value.filter((item) => !item.superResolved)
    if (!pending.length) return

    // 以模型文件名作为执行参数（name 仅用于展示，path 才是 models 目录下的 .onnx 文件名，非AI修复为 ''）
    const modelPath = globalStates.modelNames.find(
        (model) => model.name === superResolutionModelName.value
    )?.path
    if (modelPath === undefined) {
        notify('error', '未知超分模型', '详见日志')
        return
    }

    // 快照当前原图用于对比（fs 复制，避免以路径打开源文件滞留句柄）
    for (const item of pending) {
        const input = PathHelper.newPath(item.path)
        item.originalSnapshot = PathHelper.tempPath
            .join(`${v7()}super-resolution-original.${input.extname}`)
            .toString()
        await PathHelper.copy(input, item.originalSnapshot)
    }

    running.value = true
    progress.value = 0
    logger.log(
        '开始超分：',
        pending.map((item) => item.path),
        `（模型：${superResolutionModelName.value}）`
    )

    const results = await MediaHelper.superResolutionImage(
        pending.map((item) => item.path),
        modelPath,
        (value) => (progress.value = Math.round(value * 100))
    )
    running.value = false
    progress.value = 0

    // 结果直接覆盖源文件，成功后标记超分态以便展示结果图
    const failed: string[] = []
    let successCount = 0
    for (let i = 0; i < pending.length; i++) {
        const item = pending[i]!
        const tempResultPath = results[i]
        if (
            !tempResultPath ||
            !(await PathHelper.copy(tempResultPath, PathHelper.newPath(item.path)))
        ) {
            failed.push(item.path)
            continue
        }
        item.superResolved = true
        successCount++
    }

    if (successCount) globalStates.refreshImageCacheVersion()

    if (failed.length) {
        logger.error('超分失败：', failed)
        notify('error', `${failed.length} 张图片超分失败`, '失败图片详见日志')
    }
    if (successCount) {
        logger.success('超分完成，已替换源文件')
        notify('success', `超分完成，共 ${successCount} 张`)
    }
}

/** 将所有已超分图片从原图快照还原为源文件 */
async function restoreAllOriginal() {
    if (running.value) return

    const resolved = images.value.filter((item) => item.superResolved && item.originalSnapshot)
    if (!resolved.length) return

    logger.log(
        '还原原图：',
        resolved.map((item) => item.path)
    )

    const failed: string[] = []
    for (const item of resolved) {
        if (!(await PathHelper.copy(item.originalSnapshot!, PathHelper.newPath(item.path)))) {
            failed.push(item.path)
            continue
        }
        // 还原后结果区不再有效，刷新缓存让该路径图片重新显示原图
        item.superResolved = false
    }

    if (failed.length < resolved.length) globalStates.refreshImageCacheVersion()

    if (failed.length) {
        logger.error('部分图片还原失败：', failed)
        notify('error', `${failed.length} 张图片还原失败`, '失败图片详见日志')
    } else {
        logger.log('已还原原图')
        notify('info', `已还原 ${resolved.length} 张原图`)
    }
}

// 消费其他视图送来的超分请求：放入该图片
watch(
    pendingSuperResolution,
    (pending) => {
        if (!pending) return

        images.value = [newImageItem(pending.path)]
        pendingSuperResolution.value = null
    },
    { immediate: true }
)

// 模型列表加载完成后，保证当前选中项有效
watch(
    () => globalStates.modelNames,
    (models) => {
        if (!models.length) return
        if (!models.some((model) => model.name === superResolutionModelName.value)) {
            superResolutionModelName.value = models[0]!.name
        }
    },
    { immediate: true }
)
</script>

<template>
    <div class="image-super-resolution">
        <!-- 工具头部：添加/清空按钮 -->
        <div class="tab-header">
            <div style="margin-right: auto">
                <TextButton
                    v-tooltip.right="'添加文件'"
                    icon="pi pi-plus"
                    :disabled="running"
                    @click="openFileSelect"
                />
                <TextButton
                    v-if="images.length"
                    v-tooltip.right="'清空所有文件'"
                    icon="pi pi-trash"
                    :disabled="running"
                    @click="clearAll"
                />
            </div>
            <p class="note">输出图片最大尺寸为3840，超过将自动缩放</p>
        </div>
        <div class="progress-anchor">
            <ProgressBar
                v-if="running || progress > 0"
                :show-value="false"
                :value="progress"
                class="progress"
            />
        </div>
        <Scroll class="image-area">
            <div class="content">
                <!-- 文件选择/拖放区域：无图片时占满剩余空间 -->
                <div
                    v-if="!images.length"
                    :class="{ dragging: isDragging, disabled: running }"
                    class="drop-zone"
                    @click="openFileSelect"
                    @dragenter.prevent="handleDragEnter"
                    @dragleave="handleDragLeave"
                    @dragover.prevent
                    @drop.prevent="handleDrop"
                >
                    <i class="pi pi-image" />
                    <span>点击选择或拖入图片文件，支持多选</span>
                </div>
                <input
                    ref="fileInputRef"
                    accept="image/*,.jpg,.jpeg,.png,.webp"
                    hidden
                    multiple
                    type="file"
                    @change="handleFileSelect"
                />

                <!-- 图片显示区：单张时对比展示，多张时以网格展示（超分后显示结果图） -->
                <div
                    v-if="images.length"
                    class="result-section"
                    @dragenter.prevent="handleDragEnter"
                    @dragleave="handleDragLeave"
                    @dragover.prevent
                    @drop.prevent="handleDrop"
                >
                    <div v-if="images.length === 1" class="compare">
                        <div class="compare-item">
                            <div class="compare-label">原图</div>
                            <div class="compare-preview">
                                <VideoImage
                                    :image-style="containImageStyle"
                                    :path="currentItem!.originalSnapshot || currentItem!.path"
                                    border-radius="calc(var(--border-radius) * 2)"
                                    class="compare-image"
                                    image-loading="eager"
                                    @click="previewClick(currentItem!)"
                                />
                            </div>
                        </div>
                        <div v-if="currentItem!.superResolved" class="compare-item">
                            <div class="compare-label">超分</div>
                            <div class="compare-preview">
                                <VideoImage
                                    :image-style="containImageStyle"
                                    :path="currentItem!.path"
                                    border-radius="calc(var(--border-radius) * 2)"
                                    class="compare-image"
                                    image-loading="eager"
                                    @click="previewClick(currentItem!)"
                                />
                            </div>
                        </div>
                    </div>
                    <div v-else class="image-grid" data-lenis-prevent>
                        <div v-for="(item, index) in images" :key="index" class="grid-item">
                            <VideoImage
                                :image-style="containImageStyle"
                                :path="item.path"
                                class="grid-image"
                                image-loading="eager"
                                @click="previewClick(item)"
                            />
                        </div>
                    </div>
                    <!-- 拖入新文件的虚线提示层 -->
                    <div v-show="isDragging" class="drop-overlay">
                        <i class="pi pi-image" />
                        <span>松开以{{ images.length <= 1 ? '替换' : '添加' }}图片</span>
                    </div>
                </div>
            </div>
        </Scroll>

        <!-- 底部操控区：固定显示，不随图片滚动 -->
        <div class="controls">
            <InputLine title="超分模型">
                <template #right>
                    <div class="model-select">
                        <Select
                            v-model="superResolutionModelName"
                            :disabled="running"
                            :options="globalStates.modelNames"
                            option-label="name"
                            option-value="name"
                        >
                            <template #option="{ option }">
                                <div class="model-option">
                                    <span class="model-option-name">{{ option.name }}</span>
                                    <span class="model-option-description">
                                        {{ option.description }}
                                    </span>
                                </div>
                            </template>
                        </Select>
                    </div>
                </template>
            </InputLine>

            <div class="actions">
                <div style="margin-right: auto; display: flex; gap: 0.75rem">
                    <Button
                        icon="pi pi-folder-open"
                        label="打开模型目录"
                        severity="secondary"
                        :disabled="running"
                        @click="openModelPath"
                    />
                    <Button
                        v-if="images.length === 1"
                        icon="pi pi-folder-open"
                        label="打开图片目录"
                        severity="secondary"
                        :disabled="running"
                        @click="openImagePath"
                    />
                </div>

                <Button
                    v-if="images.some((item) => item.superResolved && item.originalSnapshot)"
                    :disabled="running"
                    icon="pi pi-undo"
                    label="还原原图"
                    severity="secondary"
                    @click="restoreAllOriginal"
                />
                <Button
                    :disabled="running || !images.length || !superResolutionModelName"
                    :loading="running"
                    icon="pi pi-sparkles"
                    label="开始超分"
                    @click="startSuperResolution"
                />
            </div>
        </div>
    </div>
</template>

<style lang="scss" scoped>
.image-super-resolution {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.image-area {
    flex: 1;
    min-height: 0;
}

// 零高度定位锚点，让进度条贴在 tab-header 与图片区的分隔线上
.progress-anchor {
    position: relative;
    height: 0;
}

.progress {
    height: 3px;
    border-radius: 0;
    position: absolute;
    top: -1px;
    left: 0;
    width: 100%;
    background-color: transparent;

    :deep(.p-progressbar-value) {
        background-color: var(--p-primary-color);
    }
}

// 底部操控区固定显示，不随图片区滚动
.controls {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.25rem;
}

// 内容撑满滚动区域，内部区域（如图片网格）可自行滚动
:deep(.scroller-content) {
    height: 100%;
}

.content {
    box-sizing: border-box;
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.25rem 1.25rem 0;
}

.drop-zone {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    color: var(--p-text-muted-color);
    border: 0.125rem dashed var(--p-surface-300);
    border-radius: var(--border-radius);
    transition: all 0.3s var(--animation-type);

    i {
        font-size: 1.5rem;
    }

    &.dragging {
        color: var(--p-primary-color);
        border-color: var(--p-primary-color);
        background-color: var(--p-surface-100);
    }

    &:hover {
        border-color: var(--p-primary-color);
    }

    // 超分进行中禁止交互
    &.disabled {
        pointer-events: none;
        cursor: default;
        opacity: 0.6;
    }
}

.actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
}

.result-section {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
}

.drop-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 0.5rem;
    color: var(--p-primary-color);
    background: color-mix(in srgb, var(--p-surface-100) 85%, transparent);
    border: 0.125rem dashed var(--p-primary-color);
    border-radius: var(--border-radius);
    pointer-events: none;
    z-index: 1;

    i {
        font-size: 1.5rem;
    }
}

.compare {
    flex: 1;
    min-height: 0;
    display: flex;
    gap: 1rem;
}

.compare-item {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
}

.compare-label {
    margin-bottom: 0.5rem;
    font-size: 0.875rem;
    color: var(--p-text-muted-color);
    text-align: center;
}

.compare-preview {
    flex: 1;
    min-height: 0;
    display: flex;
    justify-content: center;
    align-items: center;
}

// 撑满容器并居中显示，使 img 的 max-* 百分比约束生效，任意长宽比都完整 contain 显示
.compare-image,
.grid-image {
    flex: none;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
}

// 多图网格列表，自身滚动（Lenis 不拦截该区域的滚轮）
.image-grid {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
    grid-auto-rows: 10rem;
    gap: 0.75rem;
    align-content: start;
    overflow: auto;
}

.grid-item {
    display: flex;
    align-items: center;
    justify-content: center;
}

.model-select {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.model-option {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    padding: 0.125rem 0;
}

.model-option-description {
    font-size: 0.75rem;
    color: var(--p-text-muted-color);
}
</style>
