<script lang="ts" setup>
import type { IDependencyInfo } from '@shared'

import { useMessage } from '@renderer/components/control/message'
import { LogHelper, PathHelper, TaskHelper } from '@renderer/helper'
import { dependencyStore } from '@renderer/stores'
import { useIntervalFn } from '@vueuse/core'
import { delay } from 'es-toolkit'
import Button from 'primevue/button'
import ProgressBar from 'primevue/progressbar'
import Tag from 'primevue/tag'
import { computed, watch } from 'vue'

const dependency = dependencyStore()
const { toast } = useMessage()

/** 正在安装的依赖 id */
const installingId = computed(() =>
    ['downloading', 'extracting'].includes(dependency.state.status) ? dependency.state.id : null
)

/** 下载进度百分比 */
const progressPercent = computed(() => {
    if (!dependency.state.total) return 0
    return Math.floor((dependency.state.received / dependency.state.total) * 100)
})

/**
 * 依赖状态标签
 * @param item 依赖信息
 */
function getStatus(item: IDependencyInfo) {
    if (!item.installed) return { label: '缺失', severity: 'danger' as const }
    // 开发模式不比对版本
    if (!dependency.canInstall) return { label: '已安装', severity: 'success' as const }
    if (item.updateAvailable) return { label: '可更新', severity: 'warn' as const }
    if (!item.version) return { label: '已安装（版本未知）', severity: 'secondary' as const }

    return { label: '已安装', severity: 'success' as const }
}

/**
 * 依赖操作文案
 * @param item 依赖信息
 */
function getActionLabel(item: IDependencyInfo) {
    if (!item.installed) return '下载'
    return item.updateAvailable ? '更新' : '重新下载'
}

/** 格式化文件大小 */
function formatFileSize(size: number) {
    if (size < 1024) return `${size} B`
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`
    if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(2)} MB`

    return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`
}

/** 刷新依赖状态 */
async function refresh() {
    try {
        await dependency.refresh()
    } catch (error) {
        LogHelper.error('检查依赖失败', error)
    }
}

/**
 * 等待依赖安装结束
 * @param id 依赖 id
 */
async function waitInstall(id: string) {
    const deadline = Date.now() + 15 * 60 * 1000

    while (Date.now() < deadline) {
        const { id: currentId, status } = dependency.state
        if (currentId === id && (status === 'done' || status === 'error')) return
        await delay(500)
    }
}

/**
 * 加入下载队列
 * @param item 依赖信息
 */
function installDependency(item: IDependencyInfo) {
    if (dependency.queued.has(item.id)) return
    dependency.queued.add(item.id)

    void TaskHelper.queueWithInterval({ taskName: 'dependency-install' }, async () => {
        try {
            await dependency.install(item.id)
            await waitInstall(item.id)
        } catch (error) {
            toast.error(error instanceof Error ? error.message : '开始下载失败')
        } finally {
            dependency.queued.delete(item.id)
        }
    })
}

/**
 * 打开依赖目录
 * @param item 依赖信息
 */
function openPath(item: IDependencyInfo) {
    PathHelper.openInExplorer(PathHelper.arsrPath.extraResource.join('tools', item.id))
}

// 安装结束提示并刷新
watch(
    () => dependency.state.status,
    (status) => {
        if (status === 'done') {
            const name =
                dependency.items.find((item) => item.id === dependency.state.id)?.name ?? '依赖'
            toast.success(`${name} 安装完成`)
            void refresh()
        } else if (status === 'error' && dependency.state.error) {
            toast.error(dependency.state.error)
        }
    }
)

// 停留在本页时每 5 秒自动检查
useIntervalFn(
    () => {
        if (dependency.checking) return
        void refresh()
    },
    5000,
    { immediateCallback: true }
)
</script>

<template>
    <div class="dependency-panel">
        <div v-for="item in dependency.items" :key="item.id" class="panel-box dependency-item">
            <div class="dependency-line">
                <div class="dependency-info">
                    <div class="dependency-title">
                        <span class="dependency-name">{{ item.name }}</span>
                        <Tag v-if="item.required" value="必需" severity="danger" />
                        <Tag :value="getStatus(item).label" :severity="getStatus(item).severity" />
                    </div>
                    <span class="dependency-desc">{{ item.description }}</span>
                </div>

                <div
                    v-if="installingId !== item.id && !dependency.queued.has(item.id)"
                    class="dependency-actions"
                >
                    <Button
                        v-if="
                            dependency.canInstall &&
                            (!item.installed || item.updateAvailable || !item.version)
                        "
                        :icon="item.installed ? 'pi pi-refresh' : 'pi pi-download'"
                        :label="getActionLabel(item)"
                        :disabled="!dependency.remoteOk"
                        size="small"
                        @click="installDependency(item)"
                    />
                    <Button
                        v-if="item.installed"
                        icon="pi pi-folder-open"
                        label="打开目录"
                        severity="secondary"
                        size="small"
                        @click="openPath(item)"
                    />
                </div>
                <span
                    v-else-if="dependency.queued.has(item.id) && installingId !== item.id"
                    class="queue-text"
                >
                    排队中…
                </span>
            </div>

            <div v-if="installingId === item.id" class="progress-row">
                <ProgressBar :show-value="false" :value="progressPercent" />
                <span class="progress-text">
                    {{
                        dependency.state.status === 'extracting'
                            ? '正在解压…'
                            : `${formatFileSize(dependency.state.received)} / ${formatFileSize(dependency.state.total)}`
                    }}
                </span>
            </div>
        </div>
    </div>
</template>

<style lang="scss" scoped>
.dependency-panel {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;

    .panel-box {
        padding: 1rem;
        border: var(--separator);
        border-radius: var(--border-radius);
    }

    .dependency-item {
        .dependency-line {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 1rem;
        }

        .dependency-info {
            display: flex;
            flex-direction: column;
            gap: 0.375rem;
        }

        .dependency-title {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .dependency-name {
            font-size: 1rem;
            font-weight: 600;
        }

        .dependency-desc {
            font-size: 0.875rem;
            color: var(--p-text-muted-color);
        }

        .dependency-actions {
            display: flex;
            flex-shrink: 0;
            gap: 0.5rem;
        }

        .queue-text {
            font-size: 0.75rem;
            color: var(--p-text-muted-color);
            flex-shrink: 0;
        }

        .progress-row {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
            margin-top: 1rem;
        }

        .progress-text {
            font-size: 0.75rem;
            color: var(--p-text-muted-color);
        }
    }
}
</style>
