<script lang="ts" setup>
import Markdown from '@renderer/components/control/markdown.vue'
import { useMessage } from '@renderer/components/control/message'
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
        <!-- 版本与检查 -->
        <div class="version-line">
            <span class="version">当前版本 {{ appVersion }}</span>
            <Button
                :loading="update.checking"
                label="检查更新"
                size="small"
                variant="outlined"
                @click="checkUpdate"
            />
        </div>

        <!-- 新版本信息 -->
        <template v-if="update.info">
            <div class="release-header">
                <Tag :value="`新版本 ${update.info.version}`" severity="success" />
                <span class="release-date">{{ releaseDate }}</span>
            </div>

            <!-- 更新日志 -->
            <div v-if="update.info.notes" class="release-notes">
                <Markdown :content="update.info.notes" />
            </div>
        </template>

        <!-- 下载/安装操作，上次下载完成但未应用时也显示 -->
        <div v-if="update.info || update.state.status === 'ready'" class="actions">
            <div v-if="busy" class="progress-area">
                <ProgressBar :show-value="false" :value="progressPercent" />
                <span class="progress-text">
                    {{
                        update.state.status === 'extracting'
                            ? '正在解压…'
                            : update.state.stage === 'sevenZip'
                              ? '正在下载更新组件…'
                              : `${formatFileSize(update.state.received)} / ${formatFileSize(update.state.total)}`
                    }}
                </span>
            </div>
            <template v-else-if="update.state.status === 'ready'">
                <span v-if="update.state.targetVersion" class="ready-text">
                    已下载 {{ update.state.targetVersion }}，重启后生效
                </span>
                <Button label="重启并安装" severity="success" @click="applyUpdate" />
            </template>
            <Button
                v-else
                :disabled="update.state.status === 'applying'"
                label="下载并更新"
                @click="download"
            />
        </div>

        <p v-if="update.state.status === 'error'" class="error-text">
            {{ update.state.error }}
        </p>
    </div>
</template>

<style lang="scss" scoped>
.update-panel {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 2rem;
    padding: 1rem;
    border: var(--separator);
    border-radius: var(--border-radius);

    .version-line {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
    }

    .version {
        color: var(--p-text-muted-color);
    }

    .release-header {
        display: flex;
        align-items: center;
        gap: 0.75rem;
    }

    .release-date {
        font-size: 0.75rem;
        color: var(--p-text-muted-color);
    }

    .release-notes {
        max-height: 20rem;
        overflow: auto;
        padding-right: 0.5rem;
    }

    .actions {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        align-items: flex-start;
    }

    .progress-area {
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .progress-text {
        font-size: 0.75rem;
        color: var(--p-text-muted-color);
    }

    .ready-text {
        font-size: 0.75rem;
        color: var(--p-text-muted-color);
    }

    .error-text {
        font-size: 0.75rem;
        color: var(--p-red-500);
    }
}
</style>
