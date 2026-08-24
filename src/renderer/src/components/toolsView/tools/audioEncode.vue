<script lang="ts" setup>
import InputLine from '@renderer/components/control/inputLine/inputLine.vue'
import Scroll from '@renderer/components/control/scroll/scroll.vue'
import { toolsStore } from '@renderer/components/toolsView/toolsStore'
import { LogHelper, MediaHelper, PathHelper } from '@renderer/helper'
import { storeToRefs } from 'pinia'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import ProgressBar from 'primevue/progressbar'
import Select from 'primevue/select'
import { useToast } from 'primevue/usetoast'
import { computed, ref, watch } from 'vue'

/** 可选的音频编码格式 */
const codecOptions = ['aac', 'mp3']
const logger = LogHelper.title('tool').title('音频编码')

const toast = useToast()

/** 弹出结果提示 */
function notify(severity: 'success' | 'info' | 'warn' | 'error', summary: string, detail?: string) {
    toast.add({ severity, summary, detail, life: 3000 })
}

const inputPath = ref('')
const codec = ref('aac')
/** 采样率 */
const sampleRate = ref(48000)
/** 码率，单位kbps */
const bitrate = ref(320)

const isDragging = ref(false)
const running = ref(false)
const progress = ref(0)
const fileInputRef = ref<HTMLInputElement | null>(null)

/** 由 reencodeAudio 注册的停止函数，调用后终止 ffmpeg */
let cancelEncode: (() => void) | null = null
/** 是否为手动停止，用于与编码失败区分清理逻辑 */
let stoppedByUser = false

/** 已选文件的文件名 */
const inputFileName = computed(() =>
    inputPath.value ? PathHelper.newPath(inputPath.value).filename : ''
)

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

// 消费其他视图通过右键菜单送来的编码请求：每次都放入该文件
const { pendingAudioEncode } = storeToRefs(toolsStore())
watch(
    pendingAudioEncode,
    (pending) => {
        if (!pending) return

        setInputFile(pending.path)
        pendingAudioEncode.value = null
    },
    { immediate: true }
)

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
 * 停止编码
 */
function stopEncode() {
    if (!running.value || !cancelEncode) return
    stoppedByUser = true
    cancelEncode()
}

/**
 * 删除未完成的输出文件，ffmpeg 退出释放文件句柄需要短暂时间，失败时重试
 * @param outputPath 输出文件路径
 */
async function removePartialOutput(outputPath: string) {
    for (let i = 0; i < 10; i++) {
        if (i > 0) await new Promise((resolve) => setTimeout(resolve, 200))
        if (await PathHelper.remove(outputPath)) return true
    }

    return false
}

/**
 * 开始编码，输出文件为输入文件名追加后缀，完成后源文件移入回收站
 */
async function startEncode() {
    if (running.value || !inputPath.value) return

    running.value = true
    progress.value = 0
    stoppedByUser = false

    const input = PathHelper.newPath(inputPath.value)
    // 视频流为复制，输出容器使用mkv
    const outputPath = input.parent.join(`${input.basename}_encode.mkv`).toString()

    logger.log(
        '开始编码：',
        input.toString(),
        ' -> ',
        outputPath,
        `（${codec.value} ${sampleRate.value}Hz ${bitrate.value}k）`
    )

    const success = await MediaHelper.reencodeAudio({
        inputPath: input.toString(),
        outputPath,
        codec: codec.value,
        sampleRate: sampleRate.value,
        bitrate: `${bitrate.value}k`,
        onProgress: (value) => {
            if (value >= 0) progress.value = value * 100
        },
        onCancelRegister: (cancel) => {
            cancelEncode = cancel
        }
    })

    cancelEncode = null
    running.value = false
    progress.value = 0

    // 手动停止：删除未完成的输出文件，源文件保留以便重新编码
    if (stoppedByUser) {
        if (await removePartialOutput(outputPath)) {
            logger.warn('编码已停止，未完成的输出文件已删除：', outputPath)
            notify('info', '编码已停止')
        } else {
            logger.error('编码已停止，但删除未完成的输出文件失败：', outputPath)
            notify('warn', '编码已停止', '未完成的输出文件删除失败，请手动清理')
        }

        return
    }

    if (!success) {
        logger.error('编码失败：', input.toString())
        notify('error', '音频编码失败', '详见日志')
        return
    }

    // 源文件移入回收站，输出文件改名接替源文件
    if (!(await PathHelper.remove(input))) {
        logger.warn('编码完成，但源文件移入回收站失败：', input.toString())
        notify('warn', '音频编码完成', '源文件移入回收站失败')
        return
    }

    // 输出统一为mkv容器，改名为「源主名.mkv」（源本身是mkv时即原文件名）
    const finalPath = input.parent.join(`${input.basename}.mkv`).toString()
    const renamed = finalPath === outputPath || (await PathHelper.move(outputPath, finalPath))

    inputPath.value = ''

    if (renamed) {
        logger.success('编码完成，输出文件已接替源文件：', finalPath)
        notify('success', '音频编码完成')
    } else {
        logger.error('编码完成，但输出文件改名失败，保留_encode后缀：', outputPath)
        notify('warn', '音频编码完成', '输出文件改名失败，保留_encode后缀')
    }
}
</script>

<template>
    <div class="audio-encode">
        <!-- 工具头部 -->
        <div class="tab-header">
            <h3>音频编码</h3>
            <p class="note">重编码音频流，视频与其他轨道直接复制，适合处理infuse不能播放的视频</p>
        </div>
        <div class="progress-anchor">
            <ProgressBar
                v-if="running || progress > 0"
                :show-value="false"
                :value="progress"
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

                <InputLine description="重编码音频流，视频与其他轨道直接复制" title="编码格式">
                    <template #right>
                        <Select v-model="codec" :disabled="running" :options="codecOptions" />
                    </template>
                </InputLine>

                <InputLine title="采样率">
                    <template #right>
                        <InputNumber
                            v-model="sampleRate"
                            :disabled="running"
                            :max="192000"
                            :min="8000"
                            :step="1000"
                            :use-grouping="false"
                            show-buttons
                        />
                    </template>
                </InputLine>

                <InputLine title="码率">
                    <template #right>
                        <InputNumber
                            v-model="bitrate"
                            :disabled="running"
                            :max="1000"
                            :min="32"
                            :step="32"
                            suffix="k"
                            :use-grouping="false"
                            show-buttons
                        />
                    </template>
                </InputLine>

                <div class="actions">
                    <Button
                        v-if="!running"
                        :disabled="!inputPath"
                        icon="pi pi-play"
                        label="开始编码"
                        @click="startEncode"
                    />
                    <Button
                        v-else
                        icon="pi pi-stop-circle"
                        label="停止"
                        severity="danger"
                        @click="stopEncode"
                    />
                </div>
            </div>
        </Scroll>
    </div>
</template>

<style lang="scss" scoped>
.audio-encode {
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

    // 编码进行中禁止交互
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
