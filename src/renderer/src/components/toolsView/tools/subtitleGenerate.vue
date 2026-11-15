<script lang="ts" setup>
import type { ISubtitleLlm, SubtitleLanguage } from '@shared'

import InputLine from '@renderer/components/control/inputLine/inputLine.vue'
import Scroll from '@renderer/components/control/scroll/scroll.vue'
import { toolsStore } from '@renderer/components/toolsView/toolsStore'
import { getAgentConfig, LogHelper, PathHelper, SubtitleHelper } from '@renderer/helper'
import { ipc } from '@renderer/ipc'
import { settingsStore } from '@renderer/stores'
import { storeToRefs } from 'pinia'
import Button from 'primevue/button'
import ProgressBar from 'primevue/progressbar'
import Select from 'primevue/select'
import ToggleSwitch from 'primevue/toggleswitch'
import { useToast } from 'primevue/usetoast'
import { computed, onActivated, onMounted, ref } from 'vue'

/** 识别语言选项 */
const languageOptions = [
    { label: '日语', value: 'ja' },
    { label: '英语', value: 'en' },
    { label: '中文', value: 'zh' },
    { label: '韩语', value: 'ko' }
] satisfies { label: string; value: SubtitleLanguage }[]
/** 阶段文案 */
const stageLabels = {
    extract: '正在提取音频',
    asr: '正在识别语音',
    optimize: '正在 AI 纠错与切分',
    translate: '正在翻译'
} as const

const logger = LogHelper.title('tool').title('字幕生成')
const toast = useToast()
const settings = settingsStore()
const { subtitleLanguage, subtitleAiOptimize } = storeToRefs(toolsStore())

/**
 * 弹出结果提示
 * @param severity 类型
 * @param summary 标题
 * @param detail 详情
 */
function notify(severity: 'success' | 'info' | 'warn' | 'error', summary: string, detail?: string) {
    toast.add({ severity, summary, detail, life: 3000 })
}

const inputPath = ref('')
const isDragging = ref(false)
const running = ref(false)
/** 阶段进度 0-100，-1 表示不确定 */
const progress = ref(0)
const stageText = ref('')
const outputPath = ref('')
/** 字幕生成依赖是否已安装 */
const dependencyReady = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)

/** 由生成任务注册的停止函数 */
let cancelGenerate: (() => void) | null = null
/** 是否为手动停止 */
let stoppedByUser = false

/** 已选文件的文件名 */
const inputFileName = computed(() =>
    inputPath.value ? PathHelper.newPath(inputPath.value).filename : ''
)

/** 当前 AI 配置对应的 LLM */
const llm = computed<ISubtitleLlm | null>(() => getAgentConfig(settings.ai))

/** AI 优化不可用的原因 */
const aiHint = computed(() => (llm.value ? '' : '请先在 设置 → AI 中填写模型服务商配置'))

/**
 * 记录输入文件路径
 * @param filePath 文件绝对路径
 */
function setInputFile(filePath: string) {
    const path = PathHelper.newPath(filePath)
    if (!PathHelper.isVideoFile(path)) return

    inputPath.value = path.toString()
}

/**
 * 添加文件并记录输入路径
 * @param file 文件
 */
async function appendFile(file: File) {
    if (running.value) return

    const filePath = await PathHelper.getPathForFile(file)
    if (filePath) setInputFile(filePath)
}

/**
 * 打开文件选择窗口
 */
function openFileSelect() {
    if (running.value) return
    fileInputRef.value?.click()
}

/**
 * 处理文件选择
 * @param e 选择事件
 */
async function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''

    if (file) await appendFile(file)
}

/**
 * 处理文件拖入
 * @param e 拖放事件
 */
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

/**
 * 处理拖拽离开
 * @param e 拖拽事件
 */
function handleDragLeave(e: DragEvent) {
    if (!(e.currentTarget instanceof HTMLElement)) return
    if (e.currentTarget.contains(e.relatedTarget as Node)) return

    isDragging.value = false
}

/**
 * 停止生成
 */
function stopGenerate() {
    if (!running.value || !cancelGenerate) return

    stoppedByUser = true
    cancelGenerate()
}

/**
 * 开始生成字幕
 */
async function startGenerate() {
    if (running.value || !inputPath.value) return
    if (!dependencyReady.value) {
        notify('warn', '请先安装字幕生成依赖', '设置 → 依赖')
        return
    }
    if (subtitleAiOptimize.value && !llm.value) {
        notify('warn', aiHint.value || 'AI 配置不完整')
        return
    }

    running.value = true
    progress.value = 0
    stageText.value = '准备中'
    outputPath.value = ''
    stoppedByUser = false

    logger.log('开始生成字幕：', inputPath.value)
    const result = await SubtitleHelper.generate({
        input: {
            inputPath: inputPath.value,
            language: subtitleLanguage.value,
            aiOptimize: subtitleAiOptimize.value,
            ...(subtitleAiOptimize.value && llm.value ? { llm: llm.value } : {})
        },
        onProgress: (payload) => {
            stageText.value = payload.message ?? stageLabels[payload.stage]
            progress.value = payload.progress < 0 ? -1 : payload.progress * 100
        },
        onCancelRegister: (cancel) => {
            cancelGenerate = cancel
        }
    })

    cancelGenerate = null
    running.value = false
    progress.value = 0

    if (stoppedByUser) {
        logger.warn('字幕生成已停止：', inputPath.value)
        notify('info', '字幕生成已停止')
        return
    }

    if (!result) {
        logger.error('字幕生成失败：', inputPath.value)
        notify('error', '字幕生成失败', '详见日志')
        return
    }

    outputPath.value = result
    logger.success('字幕生成完成：', result)
    notify('success', '字幕生成完成')
}

/**
 * 打开输出目录
 */
function openOutputFolder() {
    if (!outputPath.value) return

    PathHelper.openInExplorer(PathHelper.newPath(outputPath.value).parent)
}

/**
 * 检查字幕生成依赖是否已安装
 */
async function checkDependency() {
    try {
        const list = await ipc.dependency.local.query()
        dependencyReady.value = list.some((item) => item.id === 'subtitle' && item.installed)
    } catch (error) {
        LogHelper.error('检查字幕生成依赖失败：', error)
    }
}

onMounted(checkDependency)
// 从设置页安装依赖后切回本页时重新检查
onActivated(checkDependency)
</script>

<template>
    <div class="subtitle-generate">
        <!-- 工具头部 -->
        <div class="tab-header">
            <h3>字幕生成</h3>
            <p class="note">本地识别视频语音，输出视频同目录下的中文 SRT 字幕</p>
        </div>
        <div class="progress-anchor">
            <ProgressBar
                v-if="running"
                :mode="progress < 0 ? 'indeterminate' : 'determinate'"
                :show-value="false"
                :value="Math.max(progress, 0)"
                class="progress"
            />
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
                    <i v-if="!inputPath" class="pi pi-video" />
                    <span v-if="inputPath">{{ inputFileName }}</span>
                    <span v-else>点击选择或拖入视频文件</span>
                </div>
                <input
                    ref="fileInputRef"
                    accept="video/*,.mkv,.mp4,.ts,.avi,.flv,.wmv,.mov"
                    hidden
                    type="file"
                    @change="handleFileSelect"
                />

                <InputLine description="语音识别使用的语言" title="识别语言">
                    <template #right>
                        <Select
                            v-model="subtitleLanguage"
                            :disabled="running"
                            :options="languageOptions"
                            option-label="label"
                            option-value="value"
                        />
                    </template>
                </InputLine>

                <InputLine
                    :description="aiHint || '开启后调用 AI 纠错并优化译文，关闭则直接使用谷歌翻译'"
                    title="AI 优化"
                >
                    <template #right>
                        <ToggleSwitch v-model="subtitleAiOptimize" :disabled="running" />
                    </template>
                </InputLine>

                <p v-if="!dependencyReady" class="hint warn">
                    未安装字幕生成依赖，请先在 设置 → 依赖 中下载
                </p>
                <p v-else-if="running && stageText" class="hint">{{ stageText }}</p>

                <div class="actions">
                    <Button
                        v-if="!running"
                        :disabled="!inputPath || !dependencyReady"
                        icon="pi pi-play"
                        label="开始生成"
                        @click="startGenerate"
                    />
                    <Button
                        v-else
                        icon="pi pi-stop-circle"
                        label="停止"
                        severity="danger"
                        @click="stopGenerate"
                    />
                    <Button
                        v-if="outputPath && !running"
                        icon="pi pi-folder-open"
                        label="打开目录"
                        severity="secondary"
                        @click="openOutputFolder"
                    />
                </div>
            </div>
        </Scroll>
    </div>
</template>

<style lang="scss" scoped>
.subtitle-generate {
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

    // 生成进行中禁止交互
    &.disabled {
        pointer-events: none;
        cursor: default;
        opacity: 0.6;
    }
}

.hint {
    margin-top: 0.75rem;
    font-size: 0.875rem;
    color: var(--p-text-muted-color);

    &.warn {
        color: var(--p-orange-500);
    }
}

.actions {
    margin-top: 1.5rem;
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
}

// 零高度定位锚点，让进度条贴在 tab-header 与 tool-body 的分隔线上
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
</style>
