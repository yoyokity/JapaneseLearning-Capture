<script setup lang="ts">
import Lenis from '@studio-freight/lenis'
import {
    computed,
    nextTick,
    onActivated,
    onDeactivated,
    onMounted,
    onUnmounted,
    ref,
    watch
} from 'vue'

const props = withDefaults(defineProps<IProps>(), {
    direction: 'vertical',
    showScrollbar: true,
    showScrollbarAllways: false,
    scrollbarOccupySpace: true,
    scrollbarSize: 10
})

// 定义属性
interface IProps {
    /** 滚动方向
     * @default 'vertical'
     */
    direction?: 'vertical' | 'horizontal'
    /** 是否显示滚动条
     * @default true
     */
    showScrollbar?: boolean
    /** 是否始终显示滚动条，为 false 时仅在鼠标移入后显示
     * @default false
     */
    showScrollbarAllways?: boolean
    /** 内容区域的自定义CSS样式对象
     * @default undefined
     */
    contentCss?: Record<string, string | number>
    /** 滚动条是否挤压内容区域
     * @default true
     */
    scrollbarOccupySpace?: boolean
    /** 滑块粗细，px
     * @default 10
     */
    scrollbarSize?: number
}

const wrapperRef = ref<HTMLElement | null>(null)
const contentRef = ref<HTMLElement | null>(null)
const lenisInstance = ref<Lenis | null>(null)
const scrollbarThumbSize = ref(0)
const scrollbarThumbOffset = ref(0)
const scrollbarVisible = ref(false)
const lastScrollPosition = ref(0)
const isDraggingScrollbar = ref(false)
let mutationObserver: MutationObserver | null = null
let resizeObserver: ResizeObserver | null = null
let resizeHandler: (() => void) | null = null
let removeDragListeners: (() => void) | null = null
let rafId = 0

/**
 * 获取滑块最小尺寸，默认 3rem
 */
function getMinThumbSize() {
    const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
    return (Number.isNaN(rootFontSize) ? 16 : rootFontSize) * 5
}

/**
 * 虚拟滚动条是否需要显示
 */
const shouldShowVirtualScrollbar = computed(() => {
    return props.showScrollbar && scrollbarVisible.value
})

/**
 * 是否需要为滚动条预留空间
 */
const shouldOccupyScrollbarSpace = computed(() => {
    return props.showScrollbar && props.scrollbarOccupySpace
})

/**
 * 滚动条粗细
 */
const scrollbarSize = computed(() => {
    return `${props.scrollbarSize}px`
})

/**
 * 挤压内容时预留的空间，等于粗细 + 3px
 */
const scrollbarOccupySize = computed(() => {
    return `${props.scrollbarSize + 5}px`
})

/**
 * 虚拟滚动条滑块样式
 */
const scrollbarThumbStyle = computed(() => {
    if (props.direction === 'horizontal') {
        return {
            width: `${scrollbarThumbSize.value}px`,
            transform: `translateX(${scrollbarThumbOffset.value}px)`
        }
    }

    return {
        height: `${scrollbarThumbSize.value}px`,
        transform: `translateY(${scrollbarThumbOffset.value}px)`
    }
})

/**
 * 更新虚拟滚动条的位置和尺寸
 */
function updateVirtualScrollbar() {
    if (!wrapperRef.value || !contentRef.value) return

    const isHorizontal = props.direction === 'horizontal'
    const wrapperSize = isHorizontal ? wrapperRef.value.clientWidth : wrapperRef.value.clientHeight
    const contentSize = isHorizontal ? contentRef.value.scrollWidth : contentRef.value.scrollHeight
    const scrollSize = Math.max(contentSize - wrapperSize, 0)
    const currentScroll = isHorizontal ? wrapperRef.value.scrollLeft : wrapperRef.value.scrollTop

    if (scrollSize <= 0 || wrapperSize <= 0) {
        scrollbarVisible.value = false
        scrollbarThumbSize.value = 0
        scrollbarThumbOffset.value = 0
        return
    }

    const thumbSize = Math.max((wrapperSize / contentSize) * wrapperSize, getMinThumbSize())
    const movableTrackSize = wrapperSize - thumbSize
    const thumbOffset = scrollSize > 0 ? (currentScroll / scrollSize) * movableTrackSize : 0

    scrollbarVisible.value = true
    scrollbarThumbSize.value = Math.min(thumbSize, wrapperSize)
    scrollbarThumbOffset.value = Math.min(Math.max(thumbOffset, 0), Math.max(movableTrackSize, 0))
}

/**
 * 获取当前滚动位置
 */
function getCurrentScrollPosition() {
    if (!wrapperRef.value) return 0

    return props.direction === 'horizontal'
        ? wrapperRef.value.scrollLeft
        : wrapperRef.value.scrollTop
}

/**
 * 恢复缓存的滚动位置，并同步 Lenis 内部状态
 */
function restoreScrollPosition() {
    if (!wrapperRef.value) return

    const position = lastScrollPosition.value

    if (props.direction === 'horizontal') {
        wrapperRef.value.scrollLeft = position
    } else {
        wrapperRef.value.scrollTop = position
    }

    lenisInstance.value?.scrollTo(position, {
        immediate: true,
        force: true
    })

    updateVirtualScrollbar()
}

/**
 * 根据滑块偏移同步滚动位置
 */
function syncScrollByThumbOffset(thumbOffset: number) {
    if (!wrapperRef.value || !contentRef.value) return

    const isHorizontal = props.direction === 'horizontal'
    const wrapperSize = isHorizontal ? wrapperRef.value.clientWidth : wrapperRef.value.clientHeight
    const contentSize = isHorizontal ? contentRef.value.scrollWidth : contentRef.value.scrollHeight
    const scrollSize = Math.max(contentSize - wrapperSize, 0)
    const movableTrackSize = Math.max(wrapperSize - scrollbarThumbSize.value, 0)

    if (scrollSize <= 0 || movableTrackSize <= 0) return

    const safeThumbOffset = Math.min(Math.max(thumbOffset, 0), movableTrackSize)
    const targetScroll = (safeThumbOffset / movableTrackSize) * scrollSize

    if (isHorizontal) {
        wrapperRef.value.scrollLeft = targetScroll
    } else {
        wrapperRef.value.scrollTop = targetScroll
    }

    lenisInstance.value?.scrollTo(targetScroll, {
        immediate: true,
        force: true
    })

    updateVirtualScrollbar()
}

/**
 * 清理拖拽事件
 */
function clearDragListeners() {
    removeDragListeners?.()
    removeDragListeners = null
    isDraggingScrollbar.value = false
}

/**
 * 开始拖拽虚拟滚动条
 */
function handleScrollbarDragStart(event: MouseEvent) {
    if (!props.showScrollbar || !scrollbarVisible.value) return

    event.preventDefault()
    event.stopPropagation()

    isDraggingScrollbar.value = true

    const startPointer = props.direction === 'horizontal' ? event.clientX : event.clientY
    const startThumbOffset = scrollbarThumbOffset.value

    const handleMouseMove = (moveEvent: MouseEvent) => {
        const currentPointer =
            props.direction === 'horizontal' ? moveEvent.clientX : moveEvent.clientY
        const delta = currentPointer - startPointer

        syncScrollByThumbOffset(startThumbOffset + delta)
    }

    const handleMouseUp = () => {
        clearDragListeners()
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    removeDragListeners = () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
    }
}

/**
 * 同步容器滚动能力与内容尺寸
 */
function syncScrollLayout() {
    if (!wrapperRef.value || !contentRef.value) return

    const isHorizontal = props.direction === 'horizontal'

    if (isHorizontal) {
        const contentWidth = contentRef.value.scrollWidth
        wrapperRef.value.style.overflowX =
            contentWidth > wrapperRef.value.clientWidth ? 'auto' : 'hidden'
        wrapperRef.value.style.overflowY = 'hidden'
    } else {
        const contentHeight = contentRef.value.scrollHeight
        wrapperRef.value.style.overflowY =
            contentHeight > wrapperRef.value.clientHeight ? 'auto' : 'hidden'
        wrapperRef.value.style.overflowX = 'hidden'
    }

    lenisInstance.value?.resize()
    updateVirtualScrollbar()
}

/**
 * 销毁 Lenis 实例与动画帧
 */
function destroyScroll() {
    if (rafId) {
        cancelAnimationFrame(rafId)
        rafId = 0
    }

    lenisInstance.value?.destroy()
    lenisInstance.value = null
}

/**
 * 初始化 Lenis
 */
function initScroll() {
    if (!wrapperRef.value || !contentRef.value) return

    destroyScroll()

    const isHorizontal = props.direction === 'horizontal'

    lenisInstance.value = new Lenis({
        wrapper: wrapperRef.value,
        content: contentRef.value,
        orientation: isHorizontal ? 'horizontal' : 'vertical',
        gestureOrientation: isHorizontal ? 'horizontal' : 'vertical',
        smoothWheel: true,
        syncTouch: false,
        infinite: false
    })

    lenisInstance.value.on('scroll', () => {
        updateVirtualScrollbar()
    })

    const raf = (time: number) => {
        lenisInstance.value?.raf(time)
        rafId = requestAnimationFrame(raf)
    }

    rafId = requestAnimationFrame(raf)

    nextTick(() => {
        syncScrollLayout()
    })
}

/**
 * 刷新滚动实例
 */
function refresh() {
    nextTick(() => {
        syncScrollLayout()
    })
}

/**
 * 滚动到指定位置
 */
function scrollTo(x: number, y: number, time = 500) {
    const target = props.direction === 'horizontal' ? x : y

    lenisInstance.value?.scrollTo(target, {
        duration: time / 1000,
        immediate: time <= 0
    })

    nextTick(() => {
        updateVirtualScrollbar()
    })
}

// 暴露方法给父组件
defineExpose({
    instance: lenisInstance,
    refresh,
    scrollTo
})

onMounted(() => {
    initScroll()

    resizeHandler = () => {
        refresh()
    }
    window.addEventListener('resize', resizeHandler)

    // 监听内容节点变化，自动刷新滚动区域
    if (contentRef.value) {
        mutationObserver = new MutationObserver(() => {
            refresh()
        })

        mutationObserver.observe(contentRef.value, {
            childList: true,
            subtree: true,
            attributes: true,
            characterData: true
        })
    }

    // 监听尺寸变化，自动同步滚动边界
    if (contentRef.value) {
        resizeObserver = new ResizeObserver(() => {
            refresh()
        })

        resizeObserver.observe(contentRef.value)
    }

    if (wrapperRef.value) {
        resizeObserver ??= new ResizeObserver(() => {
            refresh()
        })

        resizeObserver.observe(wrapperRef.value)
    }
})

onActivated(() => {
    nextTick(() => {
        syncScrollLayout()
        restoreScrollPosition()
    })
})

onDeactivated(() => {
    lastScrollPosition.value = getCurrentScrollPosition()
})

onUnmounted(() => {
    lastScrollPosition.value = getCurrentScrollPosition()
    clearDragListeners()

    mutationObserver?.disconnect()
    mutationObserver = null

    resizeObserver?.disconnect()
    resizeObserver = null

    if (resizeHandler) {
        window.removeEventListener('resize', resizeHandler)
        resizeHandler = null
    }

    destroyScroll()
})

watch(
    () => props.direction,
    () => {
        nextTick(() => {
            initScroll()
        })
    }
)

watch(
    () => props.contentCss,
    () => {
        refresh()
    },
    { deep: true }
)
</script>

<template>
    <div
        :class="{
            'is-scrollbar-hidden': !props.showScrollbar,
            'is-scrollbar-allways': props.showScrollbarAllways,
            'is-scrollbar-dragging': isDraggingScrollbar,
            'is-scrollbar-occupy-space': shouldOccupyScrollbarSpace
        }"
        :style="{
            '--scrollbar-size': scrollbarSize,
            '--scrollbar-occupy-size': scrollbarOccupySize
        }"
        class="scroll-shell"
    >
        <div ref="wrapperRef" :class="[`is-${props.direction}`]" class="scroll-wrapper">
            <div
                ref="contentRef"
                class="scroll-content"
                :class="[`is-${props.direction}`]"
                :style="props.contentCss"
            >
                <slot />
            </div>
        </div>
        <div
            v-if="shouldShowVirtualScrollbar"
            :class="[`is-${props.direction}`]"
            class="virtual-scrollbar-track"
        >
            <div
                :style="scrollbarThumbStyle"
                class="virtual-scrollbar-thumb"
                @mousedown="handleScrollbarDragStart"
            />
        </div>
    </div>
</template>

<style lang="scss" scoped>
.scroll-shell {
    width: 100%;
    height: 100%;
    position: relative;

    &:hover,
    &.is-scrollbar-allways {
        .virtual-scrollbar-track {
            opacity: 1;
        }
    }

    &.is-scrollbar-dragging {
        .virtual-scrollbar-track {
            opacity: 1;
        }
    }

    .scroll-wrapper {
        width: 100%;
        height: 100%;
        box-sizing: border-box;
        scrollbar-width: none;
        -ms-overflow-style: none;

        &::-webkit-scrollbar {
            display: none;
        }
    }

    &.is-scrollbar-hidden {
        .scroll-wrapper {
            scrollbar-width: none;

            &::-webkit-scrollbar {
                display: none;
            }
        }
    }

    &.is-scrollbar-occupy-space {
        .scroll-wrapper {
            &.is-vertical {
                padding-right: var(--scrollbar-occupy-size);
            }

            &.is-horizontal {
                padding-bottom: var(--scrollbar-occupy-size);
            }
        }
    }

    .scroll-content {
        min-width: 100%;
        min-height: 100%;

        &.is-horizontal {
            display: inline-flex;
            width: max-content;
        }

        &.is-vertical {
            display: block;
        }
    }

    .virtual-scrollbar-track {
        position: absolute;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.2s;

        &.is-vertical {
            top: 0;
            right: 0;
            width: var(--scrollbar-size);
            height: 100%;

            .virtual-scrollbar-thumb {
                top: 0;
                right: 0;
                width: var(--scrollbar-size);
            }
        }

        &.is-horizontal {
            left: 0;
            bottom: 0;
            width: 100%;
            height: var(--scrollbar-size);

            .virtual-scrollbar-thumb {
                left: 0;
                bottom: 0;
                height: var(--scrollbar-size);
            }
        }

        .virtual-scrollbar-thumb {
            position: absolute;
            border-radius: 1rem;
            background: var(--p-surface-400);
            pointer-events: auto;
            cursor: pointer;
            user-select: none;
        }
    }
}
</style>
