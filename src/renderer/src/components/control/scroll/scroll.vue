<script setup lang="ts">
import BScroll from '@better-scroll/core'
import MouseWheel from '@better-scroll/mouse-wheel'
import ScrollBar from '@better-scroll/scroll-bar'
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<IProps>(), {
    direction: 'vertical',
    showScrollbar: true,
    showScrollbarAllways: false,
    speed: 10,
    easeTime: 500,
    disableMouse: false,
    disableTouch: false,
    bounce: false,
    stopPropagation: false
})

// 注册插件
BScroll.use(MouseWheel)
BScroll.use(ScrollBar)

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
    /** 是否始终显示滚动条
     * @default false
     */
    showScrollbarAllways?: boolean
    /** 滚动速度因子，值越大滚动越快
     * @default 10
     */
    speed?: number
    /** 滚动动画持续时间(毫秒)
     * @default 500
     */
    easeTime?: number
    /** 是否禁用鼠标事件，滚动条也不能点击了
     * @default false
     */
    disableMouse?: boolean
    /** 是否禁用触摸事件
     * @default false
     */
    disableTouch?: boolean
    /** 是否开启回弹效果
     * @default false
     */
    bounce?: boolean
    /** 内容区域的自定义CSS样式对象
     * @default undefined
     */
    contentCss?: Record<string, string | number>
    /** 是否阻止事件冒泡
     * @default false
     */
    stopPropagation?: boolean
    /** 自定义 BetterScroll 配置选项,会与默认配置合并
     * @default undefined
     */
    options?: Record<string, any>
}

const wrapperRef = ref<HTMLElement | null>(null)
const contentRef = ref<HTMLElement | null>(null)
const bsInstance = ref<BScroll | null>(null)
let mutationObserver: MutationObserver | null = null
let resizeObserver: ResizeObserver | null = null

// 初始化 BetterScroll
const initScroll = () => {
    if (!wrapperRef.value) return

    // 销毁旧实例（如果存在）
    if (bsInstance.value) {
        bsInstance.value.destroy()
    }

    // 基础配置
    const config = {
        // 核心滚动方向配置
        scrollX: props.direction === 'horizontal',
        scrollY: props.direction === 'vertical',

        // 必须设置为 true 才能派发 scroll 事件
        probeType: 3,

        // 允许点击
        click: true,

        bounce: props.bounce,

        disableMouse: props.disableMouse,
        disableTouch: props.disableTouch,

        stopPropagation: props.stopPropagation,

        // 鼠标滚轮配置
        mouseWheel: {
            speed: props.speed,
            invert: false,
            easeTime: props.easeTime
        },

        // 滚动条配置
        scrollbar: props.showScrollbar
            ? {
                  fade: false, // 透明度显示逻辑统一交给 CSS 控制
                  interactive: true, // 允许拖动滚动条
                  scrollbarTrackClickable: true
              }
            : false, // 如果为 false 则不开启插件

        // 合并用户自定义配置
        ...props.options
    }

    // 创建实例
    bsInstance.value = new BScroll(wrapperRef.value, config)
}

// 暴露方法给父组件
defineExpose({
    instance: bsInstance,
    refresh: () => bsInstance.value?.refresh(),
    scrollTo: (x: number, y: number, time?: number) => bsInstance.value?.scrollTo(x, y, time)
})

onMounted(() => {
    initScroll()

    // 监听窗口大小变化，自动刷新 BS
    window.addEventListener('resize', () => {
        bsInstance.value?.refresh()
    })

    // 使用 MutationObserver 监听 DOM 变化
    if (contentRef.value) {
        mutationObserver = new MutationObserver(() => {
            nextTick(() => {
                bsInstance.value?.refresh()
            })
        })

        mutationObserver.observe(contentRef.value, {
            childList: true, // 监听子节点的添加或删除
            subtree: true, // 监听所有后代节点
            attributes: true, // 监听属性变化
            characterData: true // 监听文本内容变化
        })
    }

    // 使用 ResizeObserver 监听内容尺寸变化
    if (contentRef.value) {
        resizeObserver = new ResizeObserver(() => {
            nextTick(() => {
                bsInstance.value?.refresh()
            })
        })

        resizeObserver.observe(contentRef.value)
    }
})

onUnmounted(() => {
    // 销毁观察器
    mutationObserver?.disconnect()
    mutationObserver = null
    resizeObserver?.disconnect()
    resizeObserver = null

    // 销毁 BetterScroll 实例
    bsInstance.value?.destroy()
    bsInstance.value = null
})

// 监听内容变化或属性变化，重新初始化或刷新
watch(
    () => [props.direction, props.showScrollbar, props.bounce],
    () => {
        nextTick(() => initScroll())
    }
)
</script>

<template>
    <div
        ref="wrapperRef"
        :class="{ 'is-scrollbar-allways': props.showScrollbarAllways }"
        class="bs-wrapper"
    >
        <div
            ref="contentRef"
            class="bs-content"
            :class="[`is-${props.direction}`]"
            :style="props.contentCss"
        >
            <slot />
        </div>
    </div>
</template>

<style scoped>
/* 容器必须有固定高度(或父级限制)且 overflow hidden */
.bs-wrapper {
    width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
}

:deep(.bscroll-vertical-scrollbar) {
    right: -1px !important;
    width: 10px !important;
}

:deep(.bscroll-horizontal-scrollbar) {
    bottom: -1px !important;
    height: 10px !important;
}

:deep(.bscroll-vertical-scrollbar),
:deep(.bscroll-horizontal-scrollbar) {
    opacity: 0 !important;
    transition: opacity 0.3s !important;
}

.bs-wrapper:hover :deep(.bscroll-vertical-scrollbar),
.bs-wrapper:hover :deep(.bscroll-horizontal-scrollbar),
.bs-wrapper.is-scrollbar-allways :deep(.bscroll-vertical-scrollbar),
.bs-wrapper.is-scrollbar-allways :deep(.bscroll-horizontal-scrollbar) {
    opacity: 1 !important;
}

/*
  关键：水平滚动布局
  必须让子元素横向排列，且不换行，宽度由内容撑开
*/
.bs-content.is-horizontal {
    display: inline-flex; /* 或者 white-space: nowrap + display: inline-block */
    min-width: 100%; /* 确保内容少时也能撑满容器 */
}

/* 垂直滚动布局 */
.bs-content.is-vertical {
    display: block;
    min-height: 100%;
}

/**
  滚动条颜色
 */
:deep(.bscroll-indicator) {
    border-radius: 1rem !important;
    cursor: pointer !important;
    background: var(--p-surface-400) !important;
}
</style>
