<script setup lang="ts">
import { globalStatesStore } from '@renderer/stores'
import ProgressBar from 'primevue/progressbar'
import { computed, onBeforeUnmount, ref, watch } from 'vue'

const globalStates = globalStatesStore()
const visible = ref(globalStates.batchRunning)
let hideTimer: ReturnType<typeof setTimeout> | null = null

/**
 * 批量刮削总进度百分比
 */
const batchProgress = computed(() => {
    if (globalStates.batchTotalCount === 0) return 0

    return (globalStates.batchScrapedCount / globalStates.batchTotalCount) * 100
})

watch(
    () => globalStates.batchRunning,
    (batchRunning) => {
        if (hideTimer) {
            clearTimeout(hideTimer)
            hideTimer = null
        }

        if (batchRunning) {
            visible.value = true
            return
        }

        hideTimer = setTimeout(() => {
            visible.value = false
            hideTimer = null
        }, 1000)
    }
)

onBeforeUnmount(() => {
    if (hideTimer) {
        clearTimeout(hideTimer)
        hideTimer = null
    }
})
</script>

<template>
    <Teleport to="body">
        <Transition name="scraper-pregress-window-transition">
            <div v-if="visible" class="scraper-pregress-window">
                <div class="scraper-pregress-window-content">
                    <span class="scraper-pregress-window-label">批量刮削中：</span>
                    <ProgressBar :value="batchProgress" class="scraper-pregress-window-progress" />
                    <span class="scraper-pregress-window-count">
                        {{ globalStates.batchScrapedCount }}/{{ globalStates.batchTotalCount }}
                    </span>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<style lang="scss" scoped>
.scraper-pregress-window {
    z-index: 5555;
    position: fixed;
    height: calc(var(--header-height) - 1rem);
    width: calc(100% - var(--main-tab-width));
    left: var(--main-tab-width);
    top: 0px;
    pointer-events: none;

    .scraper-pregress-window-content {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin-left: 5rem;
        width: 50%;
        height: 100%;
        padding: 0 2rem;
        box-sizing: border-box;
        background-color: var(--p-surface-0);
        border: 1px solid var(--p-pink-300);
        border-top: none;
        border-bottom-left-radius: calc(var(--border-radius) * 2);
        border-bottom-right-radius: calc(var(--border-radius) * 2);
        box-shadow: 0px 0px 10px 2px rgb(0 0 0 / 10%);
        pointer-events: auto;
    }

    .scraper-pregress-window-label,
    .scraper-pregress-window-count {
        flex-shrink: 0;
        font-size: 0.875rem;
        color: var(--p-text-color);
    }

    .scraper-pregress-window-progress {
        flex: 1;
        height: 1rem;
        --p-progressbar-border-radius: 5rem;
    }
}

.scraper-pregress-window-transition-enter-active,
.scraper-pregress-window-transition-leave-active {
    transition:
        transform 0.3s var(--animation-type),
        opacity 0.3s var(--animation-type);
}

.scraper-pregress-window-transition-enter-from,
.scraper-pregress-window-transition-leave-to {
    opacity: 0;
    transform: translateY(-100%);
}

.scraper-pregress-window-transition-enter-to,
.scraper-pregress-window-transition-leave-from {
    opacity: 1;
    transform: translateY(0);
}
</style>
