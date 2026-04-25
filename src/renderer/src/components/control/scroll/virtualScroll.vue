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
    scrollbarSize: 10,
    itemCount: 0,
    overscan: 2
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
    /** 列表项数量 */
    itemCount?: number
    /** 单个列表项尺寸，垂直时为高度，水平时为宽度 */
    itemSize: number
    /** 预渲染的缓冲项数量
     * @default 2
     */
    overscan?: number
}

const wrapperRef = ref<HTMLElement | null>(null)
const contentRef = ref<HTMLElement | null>(null)
const lenisInstance = ref<Lenis | null>(null)
const scrollbarThumbSize = ref(0)
const scrollbarThumbOffset = ref(0)
const scrollbarVisible = ref(false)
const lastScrollPosition = ref(0)
const isDraggingScrollbar = ref(false)
const viewportSize = ref(0)
const contentPaddingStart = ref(0)
const contentPaddingEnd = ref(0)
const contentPaddingCrossStart = ref(0)
const contentPaddingCrossEnd = ref(0)
let resizeObserver: ResizeObserver | null = null
let resizeHandler: (() => void) | null = null
let removeDragListeners: (() => void) | null = null
let rafId = 0

/**
 * 获取滑块最小尺寸，默认 5rem
 */
function getMinThumbSize() {
    const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
    return (Number.isNaN(rootFontSize) ? 16 : rootFontSize) * 5
}

/**
 * 当前是否横向滚动
 */
const isHorizontal = computed(() => {
    return props.direction === 'horizontal'
})

/**
 * 虚拟滚动总尺寸
 */
const totalSize = computed(() => {
    return (
        Math.max(props.itemCount, 0) * Math.max(props.itemSize, 0) +
        contentPaddingStart.value +
        contentPaddingEnd.value
    )
})

/**
 * 当前滚动位置
 */
const currentScrollOffset = computed(() => {
    return Math.min(
        Math.max(lastScrollPosition.value - contentPaddingStart.value, 0),
        Math.max(totalSize.value - viewportSize.value - contentPaddingStart.value, 0)
    )
})

/**
 * 当前视口可容纳的项数
 */
const visibleCount = computed(() => {
    if (props.itemSize <= 0 || viewportSize.value <= 0) return 0

    return Math.ceil(viewportSize.value / props.itemSize)
})

/**
 * 起始渲染下标
 */
const startIndex = computed(() => {
    if (props.itemSize <= 0) return 0

    return Math.max(Math.floor(currentScrollOffset.value / props.itemSize) - props.overscan, 0)
})

/**
 * 结束渲染下标（不包含）
 */
const endIndex = computed(() => {
    const count = visibleCount.value + props.overscan * 2
    return Math.min(startIndex.value + count, props.itemCount)
})

/**
 * 当前需要渲染的索引列表
 */
const visibleIndexes = computed(() => {
    const indexes: number[] = []

    for (let index = startIndex.value; index < endIndex.value; index += 1) {
        indexes.push(index)
    }

    return indexes
})

/**
 * 已渲染内容的偏移量
 */
const renderOffset = computed(() => {
    return startIndex.value * props.itemSize
})

/**
 * 虚拟滚动条是否需要显示
 */
const shouldShowVirtualScrollbar = computed(() => {
    return props.showScrollbar && scrollbarVisible.value
})

/**
 * 当前是否存在可滚动空间
 */
const canScroll = computed(() => {
    return totalSize.value > viewportSize.value
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
 * 挤压内容时预留的空间，等于粗细 + 5px
 */
const scrollbarOccupySize = computed(() => {
    return `${props.scrollbarSize + 5}px`
})

/**
 * 占位容器样式
 */
const contentStyle = computed(() => {
    if (isHorizontal.value) {
        return {
            ...props.contentCss,
            width: `${totalSize.value}px`,
            height: '100%'
        }
    }

    return {
        ...props.contentCss,
        height: `${totalSize.value}px`,
        width: '100%'
    }
})

/**
 * 可见项容器样式
 */
const renderListStyle = computed(() => {
    if (isHorizontal.value) {
        return {
            transform: `translateX(${renderOffset.value + contentPaddingStart.value}px)`,
            height: '100%',
            top: '0',
            bottom: '0',
            left: `${contentPaddingCrossStart.value}px`,
            right: `${contentPaddingCrossEnd.value}px`
        }
    }

    return {
        transform: `translateY(${renderOffset.value + contentPaddingStart.value}px)`,
        top: '0',
        bottom: '0',
        left: `${contentPaddingCrossStart.value}px`,
        right: `${contentPaddingCrossEnd.value}px`
    }
})

/**
 * 单个列表项样式
 */
function getItemStyle() {
    const safeItemSize = Math.max(props.itemSize, 0)

    if (isHorizontal.value) {
        return {
            width: `${safeItemSize}px`,
            height: '100%',
            flex: `0 0 ${safeItemSize}px`
        }
    }

    return {
        height: `${safeItemSize}px`,
        width: '100%'
    }
}

/**
 * 读取内容区域 padding，用于修正虚拟滚动的尺寸与偏移
 */
function updateContentPadding() {
    if (!contentRef.value) return

    const style = getComputedStyle(contentRef.value)

    if (isHorizontal.value) {
        contentPaddingStart.value = Number.parseFloat(style.paddingLeft) || 0
        contentPaddingEnd.value = Number.parseFloat(style.paddingRight) || 0
        contentPaddingCrossStart.value = Number.parseFloat(style.paddingTop) || 0
        contentPaddingCrossEnd.value = Number.parseFloat(style.paddingBottom) || 0
        return
    }

    contentPaddingStart.value = Number.parseFloat(style.paddingTop) || 0
    contentPaddingEnd.value = Number.parseFloat(style.paddingBottom) || 0
    contentPaddingCrossStart.value = Number.parseFloat(style.paddingLeft) || 0
    contentPaddingCrossEnd.value = Number.parseFloat(style.paddingRight) || 0
}

/**
 * 虚拟滚动条滑块样式
 */
const scrollbarThumbStyle = computed(() => {
    if (isHorizontal.value) {
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
 * 更新视口尺寸
 */
function updateViewportSize() {
    if (!wrapperRef.value) return

    viewportSize.value = isHorizontal.value
        ? wrapperRef.value.clientWidth
        : wrapperRef.value.clientHeight
}

/**
 * 更新虚拟滚动条的位置和尺寸
 */
function updateVirtualScrollbar() {
    if (!wrapperRef.value) return

    const wrapperSize = viewportSize.value
    const contentSize = totalSize.value
    const scrollSize = Math.max(contentSize - wrapperSize, 0)
    const currentScroll = getCurrentScrollPosition()

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

    return isHorizontal.value ? wrapperRef.value.scrollLeft : wrapperRef.value.scrollTop
}

/**
 * 写入滚动位置
 */
function setScrollPosition(position: number) {
    if (!wrapperRef.value) return

    const safePosition = Math.min(
        Math.max(position, 0),
        Math.max(totalSize.value - viewportSize.value, 0)
    )

    if (isHorizontal.value) {
        wrapperRef.value.scrollLeft = safePosition
    } else {
        wrapperRef.value.scrollTop = safePosition
    }

    lastScrollPosition.value = safePosition
}

/**
 * 恢复缓存的滚动位置，并同步 Lenis 内部状态
 */
function restoreScrollPosition() {
    const position = Math.min(
        lastScrollPosition.value,
        Math.max(totalSize.value - viewportSize.value, 0)
    )

    setScrollPosition(position)

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
    const wrapperSize = viewportSize.value
    const scrollSize = Math.max(totalSize.value - wrapperSize, 0)
    const movableTrackSize = Math.max(wrapperSize - scrollbarThumbSize.value, 0)

    if (scrollSize <= 0 || movableTrackSize <= 0) return

    const safeThumbOffset = Math.min(Math.max(thumbOffset, 0), movableTrackSize)
    const targetScroll = (safeThumbOffset / movableTrackSize) * scrollSize

    setScrollPosition(targetScroll)
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

    const startPointer = isHorizontal.value ? event.clientX : event.clientY
    const startThumbOffset = scrollbarThumbOffset.value

    const handleMouseMove = (moveEvent: MouseEvent) => {
        const currentPointer = isHorizontal.value ? moveEvent.clientX : moveEvent.clientY
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
 * 同步容器滚动能力与尺寸
 */
function syncScrollLayout() {
    if (!wrapperRef.value) return

    updateContentPadding()

    updateViewportSize()

    if (isHorizontal.value) {
        wrapperRef.value.style.overflowX = totalSize.value > viewportSize.value ? 'auto' : 'hidden'
        wrapperRef.value.style.overflowY = 'hidden'
    } else {
        wrapperRef.value.style.overflowY = totalSize.value > viewportSize.value ? 'auto' : 'hidden'
        wrapperRef.value.style.overflowX = 'hidden'
    }

    const maxScroll = Math.max(totalSize.value - viewportSize.value, 0)

    if (lastScrollPosition.value > maxScroll) {
        setScrollPosition(maxScroll)
    }

    if (canScroll.value) {
        lenisInstance.value?.start()
    } else {
        lenisInstance.value?.stop()
        setScrollPosition(0)
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

    lenisInstance.value = new Lenis({
        wrapper: wrapperRef.value,
        content: contentRef.value,
        orientation: isHorizontal.value ? 'horizontal' : 'vertical',
        gestureOrientation: isHorizontal.value ? 'horizontal' : 'vertical',
        duration: 0.8,
        smoothWheel: true,
        syncTouch: false,
        infinite: false
    })

    lenisInstance.value.on('scroll', () => {
        lastScrollPosition.value = getCurrentScrollPosition()
        updateVirtualScrollbar()
    })

    const raf = (time: number) => {
        lenisInstance.value?.raf(time)
        rafId = requestAnimationFrame(raf)
    }

    rafId = requestAnimationFrame(raf)

    nextTick(() => {
        syncScrollLayout()
        restoreScrollPosition()
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
    const target = isHorizontal.value ? x : y
    const safeTarget = Math.min(
        Math.max(target, 0),
        Math.max(totalSize.value - viewportSize.value, 0)
    )

    lenisInstance.value?.scrollTo(safeTarget, {
        duration: time / 1000,
        immediate: time <= 0
    })

    lastScrollPosition.value = safeTarget

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

    resizeObserver = new ResizeObserver(() => {
        refresh()
    })

    if (wrapperRef.value) {
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
    () => [props.itemCount, props.itemSize, props.overscan],
    () => {
        refresh()
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
                :style="contentStyle"
            >
                <div
                    class="scroll-render-list"
                    :class="[`is-${props.direction}`]"
                    :style="renderListStyle"
                >
                    <div
                        v-for="index in visibleIndexes"
                        :key="index"
                        class="scroll-item"
                        :class="[`is-${props.direction}`]"
                        :style="getItemStyle()"
                    >
                        <slot :index="index" :start-index="startIndex" :end-index="endIndex" />
                    </div>
                </div>
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
        position: relative;
        box-sizing: border-box;

        &.is-horizontal {
            height: 100%;
        }

        &.is-vertical {
            width: 100%;
        }
    }

    .scroll-render-list {
        position: absolute;
        top: 0;
        left: 0;

        &.is-horizontal {
            display: flex;
        }

        &.is-vertical {
            width: auto;
        }
    }

    .scroll-item {
        box-sizing: border-box;

        &.is-horizontal {
            height: 100%;
        }

        &.is-vertical {
            width: 100%;
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
