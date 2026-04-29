<script setup lang="ts">
import type { StyleValue } from 'vue'

import imgFall from '@renderer/assets/img-fall.svg?url'
import { ImageHelper } from '@renderer/helper'
import { globalStatesStore } from '@renderer/stores'
import { onMounted, ref, watch } from 'vue'

interface ImageProps {
    path?: string | null
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
    border?: string
    borderRadius?: string
    /**
     * 是否在右上角显示数字
     */
    num?: number
}

const props = withDefaults(defineProps<ImageProps>(), {
    path: null,
    imageLoading: 'lazy',
    imageDecoding: 'async',
    imageStyle: () => ({}),
    errorImageStyle: () => ({}),
    border: 'initial',
    borderRadius: 'calc(var(--border-radius) * 2)'
})
const globalStates = globalStatesStore()

const isImgError = ref(true)
const imageData = ref<string>()

/**
 * 加载图片
 */
function loadImage() {
    if (!props.path) {
        imageData.value = ''
        isImgError.value = true
        return
    }

    imageData.value = ImageHelper.toLocalFileUrl(props.path, globalStates.imageCacheVersion)
    isImgError.value = false
}

/**
 * 处理图片加载失败
 */
function handleImageError() {
    isImgError.value = true
}

watch(() => props.path, loadImage)
watch(() => globalStates.imageCacheVersion, loadImage)

onMounted(loadImage)
</script>

<template>
    <div :class="{ error: isImgError }" class="image">
        <!-- 图片 -->
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
        <!-- 右上角数字角标 -->
        <div v-if="num && num > 0" class="image-num">
            <span>{{ num }}</span>
        </div>
    </div>
</template>

<style lang="scss" scoped>
.image {
    position: relative;
    overflow: hidden;
    border-radius: v-bind(borderRadius);
    transition: transform 0.3s var(--animation-type);
    box-sizing: border-box;
    border: v-bind(border);

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

    .image-num {
        $wdith: 2.75rem;

        position: absolute;
        top: 0;
        right: 0;
        min-width: $wdith;
        height: $wdith;

        color: #fff;
        font-size: calc(1rem - 3px);
        font-weight: bold;
        background: rgba(0, 0, 0, 0.8);
        clip-path: polygon(100% 0, 100% 100%, 0 0);
        pointer-events: none;

        display: flex;
        justify-content: center;
        align-items: center;

        span {
            transform: translate(0.5rem, -0.5rem);
        }
    }
}
</style>
