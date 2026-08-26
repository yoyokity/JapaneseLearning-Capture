<script lang="ts" setup>
import InputLine from '@renderer/components/control/inputLine/inputLine.vue'
import Scroll from '@renderer/components/control/scroll/scroll.vue'
import VideoImage from '@renderer/components/control/videoImage.vue'
import { toolsStore } from '@renderer/components/toolsView/toolsStore'
import { imgExtnames, LogHelper, MediaHelper, PathHelper } from '@renderer/helper'
import { globalStatesStore } from '@renderer/stores'
import { storeToRefs } from 'pinia'
import Button from 'primevue/button'
import Select from 'primevue/select'
import { useToast } from 'primevue/usetoast'
import { v7 } from 'uuid'
import { computed, ref, watch } from 'vue'

const logger = LogHelper.title('tool').title('图片超分')

const toast = useToast()
const globalStates = globalStatesStore()
const { pendingSuperResolution } = storeToRefs(toolsStore())

const inputPath = ref('')
const modelName = ref('')
/** 超分前的原图快照路径，用于与结果对比 */
const originalSnapshot = ref<string | null>(null)
/** 是否已完成超分（用于展示结果区） */
const superResolved = ref(false)
const isDragging = ref(false)
const running = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)

/** 已选文件的文件名 */
const inputFileName = computed(() =>
    inputPath.value ? PathHelper.newPath(inputPath.value).filename : ''
)

/** 弹出结果提示 */
function notify(severity: 'success' | 'info' | 'warn' | 'error', summary: string, detail?: string) {
    toast.add({ severity, summary, detail, life: 3000 })
}

/** 记录输入文件路径 */
function setInputFile(filePath: string) {
    const path = PathHelper.newPath(filePath)
    if (!imgExtnames.includes(path.extname.toLowerCase())) return

    inputPath.value = path.toString()
    originalSnapshot.value = null
    superResolved.value = false
}

/** 添加文件并记录输入路径 */
async function appendFile(file: File) {
    if (running.value) return

    const filePath = await PathHelper.getPathForFile(file)
    if (filePath) setInputFile(filePath)
}

/** 打开文件选择窗口 */
function openFileSelect() {
    if (running.value) return
    fileInputRef.value?.click()
}

/** 处理文件选择 */
async function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''

    if (file) await appendFile(file)
}

/** 处理文件拖入 */
async function handleDrop(e: DragEvent) {
    e.preventDefault()
    isDragging.value = false

    const file = e.dataTransfer?.files[0]
    if (file) await appendFile(file)
}

/**
 * 处理拖拽进入
 */
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
    PathHelper.openInExplorer(PathHelper.arsrPath.extraResource.join('tools/models'))
}

/** 打开当前图片所在目录 */
function openImagePath() {
    if (!inputPath.value) return
    PathHelper.openInExplorer(PathHelper.newPath(inputPath.value).parent)
}

/** 开始超分：结果直接覆盖源文件（需要原图时用「还原原图」从快照恢复） */
async function startSuperResolution() {
    if (running.value || !inputPath.value || !modelName.value) return

    const input = PathHelper.newPath(inputPath.value)

    // 快照当前原图用于对比（fs 复制，避免以路径打开源文件滞留句柄）
    originalSnapshot.value = PathHelper.tempPath
        .join(`${v7()}super-resolution-original.${input.extname}`)
        .toString()
    await PathHelper.copy(input, originalSnapshot.value)

    running.value = true
    logger.log('开始超分：', input.toString(), `（模型：${modelName.value}）`)

    const tempResultPath = await MediaHelper.superResolutionImage(input.toString(), modelName.value)
    running.value = false

    if (!tempResultPath) {
        logger.error('超分失败：', input.toString())
        notify('error', '图片超分失败', '详见日志')
        return
    }

    // 直接覆盖源文件完成替换
    if (!(await PathHelper.copy(tempResultPath, input))) {
        logger.error('超分完成，但结果写入源位置失败，结果保留在临时目录：', tempResultPath)
        notify('error', '替换失败', '结果保留在临时目录，详见日志')
        return
    }

    // 路径没变、内容已变，强制刷新图片缓存
    globalStates.refreshImageCacheVersion()
    superResolved.value = true

    logger.success('超分完成，已替换源文件：', input.toString())
    notify('success', '图片超分完成')
}

/** 将超分前的原图快照还原为源文件 */
async function restoreOriginal() {
    if (running.value || !superResolved.value || !originalSnapshot.value) return

    const input = PathHelper.newPath(inputPath.value)
    logger.log('还原原图：', input.toString())

    if (!(await PathHelper.copy(originalSnapshot.value, input))) {
        logger.error('还原失败：', input.toString())
        notify('error', '还原失败', '详见日志')
        return
    }

    // 还原后结果区不再有效，刷新缓存让该路径图片重新显示原图
    superResolved.value = false
    globalStates.refreshImageCacheVersion()

    logger.log('已还原原图：', input.toString())
    notify('info', '已还原原图')
}

// 消费其他视图送来的超分请求：放入该图片
watch(
    pendingSuperResolution,
    (pending) => {
        if (!pending) return

        setInputFile(pending.path)
        pendingSuperResolution.value = null
    },
    { immediate: true }
)

// 模型列表加载完成后，保证当前选中项有效
watch(
    () => globalStates.modelNames,
    (models) => {
        if (!models.length) return
        if (!models.some((model) => model.name === modelName.value)) {
            modelName.value = models[0]!.name
        }
    },
    { immediate: true }
)
</script>

<template>
    <div class="image-super-resolution">
        <!-- 工具头部 -->
        <div class="tab-header">
            <h3>图片超分</h3>
        </div>
        <Scroll class="tool-body">
            <div class="content">
                <!-- 文件选择/拖放区域 -->
                <div
                    :class="{ dragging: isDragging, disabled: running }"
                    class="drop-zone"
                    @click="openFileSelect"
                    @dragenter.prevent="handleDragEnter"
                    @dragleave="handleDragLeave"
                    @dragover.prevent
                    @drop.prevent="handleDrop"
                >
                    <i v-if="!inputPath" class="pi pi-image" />
                    <span v-if="inputPath">{{ inputFileName }}</span>
                    <span v-else>点击选择或拖入图片文件</span>
                </div>
                <input
                    ref="fileInputRef"
                    accept="image/*,.jpg,.jpeg,.png,.webp"
                    hidden
                    type="file"
                    @change="handleFileSelect"
                />

                <InputLine title="超分模型">
                    <template #right>
                        <div class="model-select">
                            <Select
                                v-model="modelName"
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
                    <Button
                        icon="pi pi-folder-open"
                        label="打开模型目录"
                        severity="secondary"
                        :disabled="running"
                        @click="openModelPath"
                    />
                    <Button
                        v-if="inputPath"
                        icon="pi pi-folder-open"
                        label="打开图片目录"
                        severity="secondary"
                        style="margin-right: auto"
                        :disabled="running"
                        @click="openImagePath"
                    />
                    <Button
                        v-if="superResolved && originalSnapshot"
                        :disabled="running"
                        icon="pi pi-undo"
                        label="还原原图"
                        severity="secondary"
                        @click="restoreOriginal"
                    />
                    <Button
                        :disabled="running || !inputPath || !modelName"
                        :loading="running"
                        icon="pi pi-sparkles"
                        label="开始超分"
                        @click="startSuperResolution"
                    />
                </div>

                <!-- 图片显示区：选中图片即显示原图，超分完成后并排显示对比结果 -->
                <div v-if="inputPath" class="result-section">
                    <div class="compare">
                        <div class="compare-item">
                            <div class="compare-label">{{ superResolved ? '超分前' : '原图' }}</div>
                            <VideoImage
                                :path="originalSnapshot || inputPath"
                                image-loading="eager"
                                :image-style="{ objectFit: 'contain' }"
                                class="compare-image"
                            />
                        </div>
                        <div v-if="superResolved" class="compare-item">
                            <div class="compare-label">超分后</div>
                            <VideoImage
                                :path="inputPath"
                                image-loading="eager"
                                :image-style="{ objectFit: 'contain' }"
                                class="compare-image"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </Scroll>
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

.tool-body {
    flex: 1;
    min-height: 0;
}

.content {
    padding: 1.25rem;
}

.drop-zone {
    width: 100%;
    height: 8rem;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
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
    margin-top: 1.5rem;
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
}

.result-section {
    margin-top: 1.5rem;
}

.compare {
    display: flex;
    gap: 1rem;
}

.compare-item {
    flex: 1;
    min-width: 0;
}

.compare-label {
    margin-bottom: 0.5rem;
    font-size: 0.875rem;
    color: var(--p-text-muted-color);
    text-align: center;
}

.compare-image {
    width: 100%;
    height: 20rem;
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
