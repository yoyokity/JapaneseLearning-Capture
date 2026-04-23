<script setup lang="ts">
import { globalStatesStore } from '@renderer/stores'
import ProgressBar from 'primevue/progressbar'
import Toast from 'primevue/toast'
import { useToast } from 'primevue/usetoast'
import { computed, onBeforeUnmount, watch } from 'vue'

const globalStates = globalStatesStore()
const toast = useToast()
let hideTimer: ReturnType<typeof setTimeout> | null = null
const toastGroup = 'scraper-progress'
const toastSummary = '批量刮削中'

/**
 * 批量刮削总进度百分比
 */
const batchProgress = computed(() => {
    if (globalStates.batchTotalCount === 0) return 0

    return Math.round((globalStates.batchScrapedCount / globalStates.batchTotalCount) * 100)
})

/**
 * 显示进度提示
 */
function showToast() {
    toast.removeGroup(toastGroup)
    toast.add({
        severity: 'secondary',
        summary: toastSummary,
        group: toastGroup,
        life: 0
    })
}

/**
 * 关闭进度提示
 */
function hideToast() {
    toast.removeGroup(toastGroup)
}

watch(
    () => globalStates.batchRunning,
    (batchRunning) => {
        if (hideTimer) {
            clearTimeout(hideTimer)
            hideTimer = null
        }

        if (batchRunning) {
            showToast()
            return
        }

        hideTimer = setTimeout(() => {
            hideToast()
            hideTimer = null
        }, 1000)
    },
    { immediate: true }
)

onBeforeUnmount(() => {
    if (hideTimer) {
        clearTimeout(hideTimer)
        hideTimer = null
    }

    hideToast()
})
</script>

<template>
    <Toast :group="toastGroup" position="top-center" style="--p-toast-blur: 10px">
        <template #container="{ message }">
            <section class="scraper-pregress-window">
                <div class="scraper-pregress-window-header">
                    <i class="pi pi-sync scraper-pregress-window-icon" />
                    <span class="scraper-pregress-window-title">{{ message.summary }}</span>
                </div>
                <div class="scraper-pregress-window-body">
                    <ProgressBar
                        :value="batchProgress"
                        :show-value="false"
                        class="scraper-pregress-window-progress"
                    />
                    <div class="scraper-pregress-window-info">
                        <label>
                            {{ globalStates.batchScrapedCount }}/{{ globalStates.batchTotalCount }}
                            已完成
                        </label>
                        <label>{{ batchProgress }}%</label>
                    </div>
                </div>
            </section>
        </template>
    </Toast>
</template>

<style lang="scss" scoped>
.scraper-pregress-window {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
}

.scraper-pregress-window-header {
    display: flex;
    align-items: center;
    gap: 1rem;
}

.scraper-pregress-window-icon {
    font-size: 1rem;
    animation: scraper-pregress-window-rotate 1.2s linear infinite;
}

.scraper-pregress-window-title {
    font-size: 1rem;
    line-height: 1.5rem;
}

.scraper-pregress-window-body {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

.scraper-pregress-window-info {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    line-height: 1.25rem;
    font-size: 0.875rem;
}

.scraper-pregress-window-progress {
    height: 4px;
}

@keyframes scraper-pregress-window-rotate {
    from {
        transform: rotate(0deg);
    }

    to {
        transform: rotate(360deg);
    }
}
</style>
