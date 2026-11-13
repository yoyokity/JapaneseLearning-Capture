<script setup lang="ts">
import { useRafFn } from '@vueuse/core'
import Lenis from 'lenis'
import { nextTick, onMounted, onUnmounted, ref } from 'vue'

interface IProps {
    /** 滚动条挤压内容区域宽度
     * @default '0.5rem'
     */
    occupySpace?: string
}

withDefaults(defineProps<IProps>(), {
    occupySpace: '0.5rem'
})

const scroller = ref<HTMLElement>()
const content = ref<HTMLElement>()
let lenis: Lenis | null = null

/** 外部持续驱动 Lenis，否则鼠标滚轮事件不会产生滚动 */
const { resume } = useRafFn(({ timestamp }) => lenis?.raf(timestamp), { immediate: false })

onMounted(() => {
    nextTick(() => {
        if (scroller.value && content.value) {
            lenis = new Lenis({
                wrapper: scroller.value,
                content: content.value, // 关键：指向内层的内容包裹层
                lerp: 0.15,
                smoothWheel: true
            })

            resume()
        }
    })
})

onUnmounted(() => {
    lenis?.destroy() // 组件卸载时清理
    lenis = null
})
</script>

<template>
    <div ref="scroller" class="scroller">
        <div ref="content" class="scroller-content">
            <slot />
        </div>
    </div>
</template>

<style lang="scss" scoped>
.scroller {
    overflow-y: auto;
    padding-right: v-bind(occupySpace);
}

/* 整个滚动条轨道 */
.scroller::-webkit-scrollbar {
    width: 8px; /* 宽度纤细，更现代 */
}

/* 滚动的滑块 */
.scroller::-webkit-scrollbar-thumb {
    background: var(--p-surface-400);
    border-radius: 1rem;
    cursor: pointer;
}
</style>
