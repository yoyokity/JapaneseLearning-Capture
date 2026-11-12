<script lang="ts" setup>
import Markdown from '@renderer/components/control/markdown.vue'
import { useMessage } from '@renderer/components/control/message'
import { PathHelper } from '@renderer/helper'
import { updateStore } from '@renderer/stores'
import dayjs from 'dayjs'
import Button from 'primevue/button'
import ProgressBar from 'primevue/progressbar'
import Tag from 'primevue/tag'
import { computed } from 'vue'

const appVersion = __APP_VERSION__

const update = updateStore()
const { confirmDialog, toast } = useMessage()

/**
 * 是否正在下载或解压
 */
const busy = computed(
    () => update.state.status === 'downloading' || update.state.status === 'extracting'
)

/**
 * 下载进度百分比
 */
const progressPercent = computed(() => {
    if (!update.state.total) return 0
    return Math.floor((update.state.received / update.state.total) * 100)
})

/**
 * 发布日期（本地时区）
 */
const releaseDate = computed(() =>
    update.info?.publishedAt ? dayjs(update.info.publishedAt).format('YYYY-MM-DD') : ''
)

/**
 * 格式化文件大小
 * @param size 文件大小
 */
function formatFileSize(size: number) {
    if (size < 1024) return `${size} B`
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`
    if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(2)} MB`

    return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`
}

/**
 * 打开应用根目录
 */
function openAppPath() {
    PathHelper.openInExplorer(PathHelper.appPath)
}

/**
 * 打开临时目录
 */
function openTempPath() {
    PathHelper.openInExplorer(PathHelper.tempPath)
}

/**
 * 打开日志文件
 */
function openLogsFile() {
    PathHelper.openInExplorer(PathHelper.logsPath.join('main.log'))
}

/**
 * 手动检查更新
 */
async function checkUpdate() {
    try {
        const info = await update.check()
        if (!info) toast.info('当前已是最新版本')
    } catch {
        toast.error('检查更新失败，请检查网络或代理设置')
    }
}

/**
 * 下载更新包
 */
async function download() {
    try {
        await update.download()
    } catch (error) {
        toast.error(error instanceof Error ? error.message : '开始下载失败，请重新检查更新')
    }
}

/**
 * 重启并应用更新
 */
function applyUpdate() {
    confirmDialog.yesOrNo('更新需要关闭应用，完成后会自动重启，确定继续吗？', () => {
        void update.apply().catch((error) => {
            toast.error(error instanceof Error ? error.message : '启动更新失败')
        })
    })
}
</script>

<template>
    <div class="update-panel">
        <!-- 路径操作 -->
        <div class="path-actions">
            <Button icon="pi pi-folder-open" label="打开根目录" @click="openAppPath" />
            <Button
                icon="pi pi-folder-open"
                label="打开临时目录"
                severity="secondary"
                @click="openTempPath"
            />
            <Button
                icon="pi pi-folder-open"
                label="打开日志文件"
                severity="secondary"
                @click="openLogsFile"
            />
        </div>

        <!-- 版本与操作 -->
        <div class="panel-box version-block">
            <div class="version-line">
                <div class="version-info">
                    <template v-if="update.state.status === 'ready' && update.state.targetVersion">
                        <span class="ready-text">
                            已下载 {{ update.state.targetVersion }}，重启后生效
                        </span>
                    </template>
                    <template v-else-if="update.info">
                        <Tag :value="`新版本 ${update.info.version}`" severity="success" />
                        <span class="release-date">{{ releaseDate }}</span>
                    </template>
                    <span v-else class="current-version">当前版本 {{ appVersion }}</span>
                </div>

                <div v-if="!busy">
                    <Button
                        v-if="update.state.status === 'ready'"
                        label="重启并安装"
                        severity="success"
                        @click="applyUpdate"
                    />
                    <Button
                        v-else-if="update.info"
                        :disabled="!update.canDownload"
                        label="下载并更新"
                        @click="download"
                    />
                    <Button
                        v-else
                        :loading="update.checking"
                        label="检查更新"
                        size="small"
                        variant="outlined"
                        @click="checkUpdate"
                    />
                </div>
            </div>

            <!-- 下载进度 -->
            <div v-if="busy" class="progress-row">
                <ProgressBar :show-value="false" :value="progressPercent" />
                <span class="progress-text">
                    {{
                        update.state.status === 'extracting'
                            ? '正在解压…'
                            : `${formatFileSize(update.state.received)} / ${formatFileSize(update.state.total)}`
                    }}
                </span>
            </div>

            <p v-if="update.state.status === 'error'" class="error-text">
                {{ update.state.error }}
            </p>
        </div>

        <!-- 更新日志 -->
        <div v-if="update.info?.notes" class="panel-box release-notes">
            <Markdown :content="update.info.notes" />
        </div>
    </div>
</template>

<style lang="scss" scoped>
.update-panel {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;

    .panel-box {
        padding: 1rem;
        border: var(--separator);
        border-radius: var(--border-radius);
    }

    .path-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin-bottom: 0.75rem;
    }

    .version-block {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .version-line {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
    }

    .version-info {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.75rem;
    }

    .current-version,
    .release-date,
    .progress-text,
    .ready-text {
        font-size: 0.75rem;
        color: var(--p-text-muted-color);
    }

    .progress-row {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .error-text {
        font-size: 0.75rem;
        color: var(--p-red-500);
    }

    .release-notes {
        :deep(.markdown-body) {
            font-size: 0.875rem;
        }
    }
}
</style>
