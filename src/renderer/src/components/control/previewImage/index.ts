import { createGlobalState } from '@vueuse/core'
import { ref } from 'vue'

/** 图片预览组件 */
export { default as PreviewImage } from './previewImage.vue'

/** 对比预览的图片路径对 */
export interface PreviewImageDiff {
    /** 对比的前图路径 */
    before: string
    /** 对比的后图路径 */
    after: string
}

/**
 * 图片预览 hook
 */
export const usePreviewImage = createGlobalState(() => {
    /** 当前预览的图片路径，null 表示未在预览 */
    const previewImage = ref<string | null>(null)
    /** 对比预览的图片路径对，与 previewImage 互斥 */
    const previewImageDiff = ref<PreviewImageDiff | null>(null)

    /**
     * 设置预览图片，传入 null 关闭预览
     * @param value - 图片路径
     */
    function setPreviewImage(value: string | null) {
        previewImage.value = value
        previewImageDiff.value = null
    }

    /**
     * 设置对比预览，传入 null 关闭预览
     * @param value - 前后对比图片路径对
     */
    function setPreviewImageDiff(value: PreviewImageDiff | null) {
        previewImageDiff.value = value
        previewImage.value = null
    }

    return {
        /** 当前预览的图片路径 */
        previewImage,
        /** 对比预览的图片路径对 */
        previewImageDiff,
        /** 设置预览图片 */
        setPreviewImage,
        /** 设置对比预览 */
        setPreviewImageDiff
    }
})
