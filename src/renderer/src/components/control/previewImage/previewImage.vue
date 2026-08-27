<script lang="ts" setup>
import type { CIBeforeAfterInstance } from '@cloudimage/before-after'

import CIBeforeAfter from '@cloudimage/before-after'
import { MediaHelper } from '@renderer/helper'
import { globalStatesStore } from '@renderer/stores'
import { computed, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'

import { usePreviewImage } from '.'

const { previewImage, setPreviewImage, previewImageDiff, setPreviewImageDiff } = usePreviewImage()
const globalStates = globalStatesStore()

const containerRef = useTemplateRef<HTMLDivElement>('containerRef')
/** 左图尺寸文字 */
const beforeSize = ref('')
/** 右图尺寸文字 */
const afterSize = ref('')
let viewer: CIBeforeAfterInstance | null = null

/** 是否为对比预览模式 */
const isCompare = computed(() => !!previewImageDiff.value)
/** 单图预览的图片 URL */
const imageUrl = computed(() => toImageUrl(previewImage.value ?? undefined))
/** 对比预览的前图 URL */
const beforeImageUrl = computed(() => toImageUrl(previewImageDiff.value?.before))
/** 对比预览的后图 URL */
const afterImageUrl = computed(() => toImageUrl(previewImageDiff.value?.after))
/** 查看器前图源：对比模式为前图，单图模式为预览图 */
const beforeSrc = computed(() => (isCompare.value ? beforeImageUrl.value : imageUrl.value))
/** 查看器后图源：对比模式为后图，单图模式为预览图 */
const afterSrc = computed(() => (isCompare.value ? afterImageUrl.value : imageUrl.value))

/**
 * 图片路径转本地 file URL，空路径返回空串
 * @param path - 图片路径
 */
function toImageUrl(path: string | undefined) {
    return path ? MediaHelper.toLocalFileUrl(path, globalStates.imageCacheVersion) : ''
}

/**
 * 滚轮缩放处理：任意滚轮都直接缩放，无需按 Ctrl
 * @param e 滚轮事件
 */
function handleWheel(e: WheelEvent) {
    if (e.ctrlKey || e.metaKey) return

    e.preventDefault()
    e.stopPropagation()
    // 重新派发带 Ctrl 标记的滚轮事件，走库的原生缩放逻辑
    containerRef.value?.dispatchEvent(
        new WheelEvent('wheel', {
            deltaY: e.deltaY,
            clientX: e.clientX,
            clientY: e.clientY,
            ctrlKey: true,
            bubbles: true,
            cancelable: true
        })
    )
}

/**
 * 创建对比查看器
 */
function createViewer() {
    const container = containerRef.value!
    container.addEventListener('wheel', handleWheel, { capture: true, passive: false })

    viewer = new CIBeforeAfter(container, {
        beforeSrc: beforeSrc.value,
        afterSrc: afterSrc.value,
        zoom: true,
        zoomMax: 8,
        theme: 'dark',
        labels: false,
        handleStyle: 'line',
        fullscreenButton: false,
        lazyLoad: false,
        zoomControls: false,
        onReady: () => {
            // 按左图宽高比约束容器尺寸，实现 contain 显示
            const beforeImage = container.querySelector<HTMLImageElement>('.ci-before-after-before')
            const afterImage = container.querySelector<HTMLImageElement>('.ci-before-after-after')
            if (!beforeImage) return

            container.style.setProperty(
                '--img-ratio',
                String(beforeImage.naturalWidth / beforeImage.naturalHeight || 1)
            )
            // 记录两张图尺寸：单图模式显示尺寸，对比模式分两行显示左右图尺寸
            beforeSize.value = `${beforeImage.naturalWidth} × ${beforeImage.naturalHeight}`
            afterSize.value = afterImage
                ? `${afterImage.naturalWidth} × ${afterImage.naturalHeight}`
                : ''
        }
    })
}

/**
 * 关闭预览
 */
function closePreview() {
    setPreviewImage(null)
    setPreviewImageDiff(null)
}

watch(
    [previewImage, previewImageDiff],
    ([image, diff]) => {
        if (!image && !diff) {
            // 关闭预览时销毁实例，释放 DOM 引用
            viewer?.destroy()
            viewer = null
            return
        }

        // 首次打开时创建实例，已存在则更新图片
        if (!viewer) createViewer()
        else viewer.update({ beforeSrc: beforeSrc.value, afterSrc: afterSrc.value })
    },
    { immediate: true, flush: 'post' }
)

watch([beforeSrc, afterSrc], ([before, after]) => {
    viewer?.update({ beforeSrc: before, afterSrc: after })
})

onBeforeUnmount(() => {
    viewer?.destroy()
    viewer = null
})
</script>

<template>
    <Teleport to="body">
        <Transition mode="out-in" name="fade">
            <div
                v-if="previewImage || previewImageDiff"
                class="preview-image-modal"
                @click.self="closePreview"
            >
                <div
                    ref="containerRef"
                    :class="{ compare: isCompare }"
                    class="preview-image-container"
                />
                <div v-if="isCompare" class="preview-size">
                    <div>左：{{ beforeSize }}</div>
                    <div>右：{{ afterSize }}</div>
                </div>
                <div v-else-if="beforeSize" class="preview-size">{{ beforeSize }}</div>
                <div class="preview-close" @click="closePreview">
                    <i class="pi pi-times" />
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<style lang="scss" scoped>
.preview-image-modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: color-mix(in srgb, var(--p-surface-900) 80%, transparent);
    color: var(--p-mask-color);
    z-index: 9999;
    display: flex;
    justify-content: center;
    align-items: center;
    backdrop-filter: blur(16px);
}

.preview-image-container {
    width: min(90vw, calc(90vh * var(--img-ratio, 1)));
    max-height: 90vh;

    // 单图预览不需要对比分割线，对比模式保留
    &:not(.compare) {
        :deep(.ci-before-after-handle) {
            display: none;
        }
    }
}

.preview-size {
    position: absolute;
    top: 1rem;
    left: 1rem;
    padding: 0.35rem 0.75rem;
    border-radius: 0.5rem;
    background: rgba(0, 0, 0, 0.5);
    color: #fff;
    font-size: 0.85rem;
    pointer-events: none;
    user-select: none;

    // 对比模式两行尺寸文字留出行距
    div + div {
        margin-top: 0.25rem;
    }
}

.preview-close {
    position: absolute;
    top: 1rem;
    right: 1rem;
    width: 2.25rem;
    height: 2.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    cursor: pointer;
    background: rgba(0, 0, 0, 0.5);
    color: #fff;
    transition: all 0.3s var(--animation-type);

    &:hover {
        background: rgba(255, 255, 255, 0.2);
    }
}

.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}

.fade-enter-to,
.fade-leave-from {
    opacity: 1;
}
</style>
