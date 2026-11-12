<script lang="ts" setup>
import appIcon from '@renderer/assets/app-icon.png?url'
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

/** 是否正在下载或解压 */
const busy = computed(
    () => update.state.status === 'downloading' || update.state.status === 'extracting'
)

/** 下载进度百分比 */
const progressPercent = computed(() => {
    if (!update.state.total) return 0
    return Math.floor((update.state.received / update.state.total) * 100)
})

/** 格式化发布日期 */
function formatReleaseDate(publishedAt: string) {
    return publishedAt ? dayjs(publishedAt).format('YYYY-MM-DD') : ''
}

/** 格式化文件大小 */
function formatFileSize(size: number) {
    if (size < 1024) return `${size} B`
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`
    if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(2)} MB`

    return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`
}

/** 打开应用根目录 */
function openAppPath() {
    PathHelper.openInExplorer(PathHelper.appPath)
}

/** 打开临时目录 */
function openTempPath() {
    PathHelper.openInExplorer(PathHelper.tempPath)
}

/** 打开日志文件 */
function openLogsFile() {
    PathHelper.openInExplorer(PathHelper.logsPath.join('main.log'))
}

/** 打开项目主页 */
function openGitHub() {
    // 主进程会转到系统浏览器
    window.open('https://github.com/yoyokity/JapaneseLearning-Capture')
}

/** 手动检查更新 */
async function checkUpdate() {
    try {
        const info = await update.check()
        if (!info) toast.info('当前已是最新版本')
    } catch {
        toast.error('检查更新失败，请检查网络或代理设置')
    }
}

/** 下载更新包 */
async function download() {
    try {
        await update.download()
    } catch (error) {
        toast.error(error instanceof Error ? error.message : '开始下载失败，请重新检查更新')
    }
}

/** 重启并应用更新 */
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
        <div class="panel-box info-block">
            <div class="info-line">
                <div class="app-info">
                    <img class="app-icon" :src="appIcon" alt="" />
                    <div class="app-titles">
                        <span class="app-name">Japanese Learning Capture</span>
                        <span class="current-version">版本 v{{ appVersion }}</span>
                    </div>
                </div>

                <div v-if="!busy">
                    <Button
                        v-if="update.state.status === 'ready'"
                        label="重启并安装"
                        severity="success"
                        size="small"
                        @click="applyUpdate"
                    />
                    <Button
                        v-else-if="update.info"
                        :disabled="!update.canDownload"
                        :label="`更新到 v${update.info.version}`"
                        icon="pi pi-download"
                        size="small"
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

            <div
                v-if="update.state.status === 'ready' && update.state.targetVersion"
                class="update-line"
            >
                已下载 v{{ update.state.targetVersion }}，重启后生效
            </div>
            <div v-else-if="update.info" class="update-line">
                检测到新版本：v{{ update.info.version }}
            </div>

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

            <div class="path-actions">
                <Button
                    icon="pi pi-folder-open"
                    label="打开根目录"
                    severity="secondary"
                    size="small"
                    @click="openAppPath"
                />
                <Button
                    icon="pi pi-folder-open"
                    label="打开临时目录"
                    severity="secondary"
                    size="small"
                    @click="openTempPath"
                />
                <Button
                    icon="pi pi-folder-open"
                    label="打开日志文件"
                    severity="secondary"
                    size="small"
                    @click="openLogsFile"
                />
                <Button
                    icon="pi pi-github"
                    label="GitHub"
                    severity="secondary"
                    size="small"
                    @click="openGitHub"
                />
            </div>
        </div>

        <template v-if="update.info">
            <div
                v-for="release in update.info.releases"
                :key="release.version"
                class="panel-box release-notes"
            >
                <div class="release-header">
                    <Tag :value="`v${release.version}`" severity="success" />
                    <span class="release-date">{{ formatReleaseDate(release.publishedAt) }}</span>
                </div>
                <Markdown :content="release.notes" />
            </div>
        </template>
    </div>
</template>

<style lang="scss" scoped>
.update-panel {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;

    .panel-box {
        padding: 1rem;
        border: var(--separator);
        border-radius: var(--border-radius);
    }

    .info-block {
        padding: 0;

        .info-line {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 1rem;
            padding: 1.25rem 1rem;
        }

        .app-info {
            display: flex;
            align-items: center;
            gap: 0.75rem;
        }

        .app-icon {
            width: 3rem;
            height: 3rem;
            border-radius: var(--border-radius);
        }

        .app-titles {
            display: flex;
            flex-direction: column;
            gap: 0.125rem;
        }

        .app-name {
            font-size: 1.125rem;
            font-weight: 600;
        }

        .update-line {
            padding: 1rem;
            border-top: var(--separator);
            font-size: 1rem;
        }

        .progress-row,
        .error-text {
            margin: 0;
            padding: 1rem;
            border-top: var(--separator);
        }

        .path-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
            padding: 1.25rem 1rem;
            border-top: var(--separator);
        }
    }

    .release-date,
    .progress-text {
        font-size: 0.75rem;
        color: var(--p-text-muted-color);
    }

    .current-version {
        font-size: 1rem;
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
        // 缩小字号
        :deep(.markdown-body) {
            font-size: 0.875rem;

            // 去掉首元素间距
            > :first-child {
                margin-top: 0;
            }
        }
    }

    .release-header {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin-bottom: 0.75rem;
    }
}
</style>
