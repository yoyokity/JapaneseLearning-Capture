<script setup lang="ts">
import type { StyleValue } from 'vue'

import imgFall from '@renderer/assets/img-fall.svg?url'
import { ImageHelper } from '@renderer/helper'
import { globalStatesStore } from '@renderer/stores'
import { onMounted, ref, watch } from 'vue'

interface ImageProps {
    imgData?: string | null
    imageLoading?: 'eager' | 'lazy'
    imageDecoding?: 'sync' | 'async' | 'auto'
    /**
     * 普通状态下的图片样式
     */
    imageStyle?: StyleValue
    /**
     * 错误状态下的图片样式
     */
    errorImageStyle?: StyleValue
    borderRadius?: string
}

const props = withDefaults(defineProps<ImageProps>(), {
    imgData: null,
    imageLoading: 'lazy',
    imageDecoding: 'async',
    imageStyle: () => ({}),
    errorImageStyle: () => ({}),
    borderRadius: 'calc(var(--border-radius) * 2)'
})
const globalStates = globalStatesStore()

const isImgError = ref(true)
const imageData = ref<string>()

/**
 * 加载图片
 */
function loadImage() {
    if (!props.imgData) {
        imageData.value = ''
        isImgError.value = true
        return
    }

    imageData.value = ImageHelper.toLocalFileUrl(props.imgData, globalStates.imageCacheVersion)
    isImgError.value = false
}

/**
 * 处理图片加载失败
 */
function handleImageError() {
    console.error('local-file 图片加载失败', {
        originalPath: props.imgData,
        imageUrl: imageData.value
    })
    isImgError.value = true
}

watch(() => props.imgData, loadImage)
watch(() => globalStates.imageCacheVersion, loadImage)

onMounted(loadImage)
</script>

<template>
    <div :class="{ error: isImgError }" class="image">
        <img
            v-if="!isImgError"
            :src="imageData"
            :loading="imageLoading"
            :decoding="imageDecoding"
            :style="imageStyle"
            class="video-card-img"
            @error="handleImageError"
        />
        <img v-else :src="imgFall" :style="errorImageStyle" class="video-card-img error" />
    </div>
</template>

<style lang="scss" scoped>
.image {
    overflow: hidden;
    border-radius: v-bind(borderRadius);
    transition: transform 0.3s var(--animation-type);

    &.error {
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .video-card-img {
        width: 100%;
        height: 100%;
        object-fit: cover; // 使用 object-fit: cover 确保图片等比例填充容器
        object-position: center; // 居中显示图片
        transition: transform 0.3s var(--animation-type);
        -webkit-user-drag: none;

        &.error {
            width: initial;
            height: initial;
        }
    }
}
</style>
