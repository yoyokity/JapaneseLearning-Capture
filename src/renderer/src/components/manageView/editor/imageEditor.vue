<script lang="ts" setup>
import type { IScraperVideoFuncs, IVideoFile } from '@renderer/scraper'
import type { Ref } from 'vue'

import VideoImage from '@renderer/components/control/VideoImage.vue'
import { ImageHelper, PathHelper } from '@renderer/helper'
import Button from 'primevue/button'
import { computed } from 'vue'
import { LazyImg, Waterfall } from 'vue-waterfall-plugin-next'

import { useMessage } from '../../control/message'
import { scraperField } from '../func.scraper'

interface IProps {
    video: IVideoFile
    webContent: Ref<string>
    previewImage: ArrayBuffer | null
}

const props = defineProps<IProps>()

const emit = defineEmits<{
    'update:video': [value: IVideoFile]
    'update:previewImage': [value: ArrayBuffer | null]
}>()

const { toast } = useMessage()

const imageLabels: Record<'poster' | 'fanart' | 'thumb', string> = {
    poster: '封面',
    fanart: '背景',
    thumb: '缩略图'
}

const video = computed({
    get: () => props.video,
    set: (value: IVideoFile) => {
        emit('update:video', value)
    }
})

const previewImage = computed({
    get: () => props.previewImage,
    set: (value: ArrayBuffer | null) => {
        emit('update:previewImage', value)
    }
})

/**
 * 剧照瀑布流数据
 */
const extrafanartList = computed(() =>
    (video.value.extrafanart || []).map((item, index) => ({
        id: index,
        imgData: item,
        src: arrayBufferToDataUrl(item)
    }))
)

/**
 * 将 ArrayBuffer 转换为 Data URL
 * @param buffer 图片二进制数据
 */
function arrayBufferToDataUrl(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i])
    }

    const base64 = btoa(binary)
    const header = bytes.slice(0, 4)
    let mimeType = 'image/jpeg'

    if (header[0] === 0x89 && header[1] === 0x50) {
        mimeType = 'image/png'
    } else if (header[0] === 0x47 && header[1] === 0x49) {
        mimeType = 'image/gif'
    } else if (header[0] === 0x52 && header[1] === 0x49) {
        mimeType = 'image/webp'
    }

    return `data:${mimeType};base64,${base64}`
}

/**
 * 同步预览图到父组件
 * @param value 预览图数据
 */
function setPreviewImage(value: ArrayBuffer | null) {
    previewImage.value = value
}

/**
 * 处理图片拖入替换
 * @param e 拖放事件
 * @param imageType 图片类型
 */
async function handleDrop(e: DragEvent, imageType: 'poster' | 'fanart' | 'thumb') {
    e.preventDefault()

    if (e.currentTarget instanceof HTMLElement) {
        e.currentTarget.classList.remove('dragover')
    }

    if (!e.dataTransfer?.files?.length) return

    const file = e.dataTransfer.files[0]
    const filePath = await PathHelper.getPathForFile(file)
    if (!filePath) return

    video.value = {
        ...video.value,
        [imageType]: await ImageHelper.readImage(filePath)
    }
}

/**
 * 处理拖拽覆盖态
 * @param e 拖拽事件
 * @param action 拖拽动作
 */
function handleDrag(e: DragEvent, action: 'enter' | 'leave' | 'over') {
    e.preventDefault()

    if (!(e.currentTarget instanceof HTMLElement)) return

    if (action === 'enter') {
        e.currentTarget.classList.add('dragover')
        return
    }

    if (action === 'leave' && !e.currentTarget.contains(e.relatedTarget as Node)) {
        e.currentTarget.classList.remove('dragover')
    }
}

/**
 * 执行单张图片刮削
 * @param label 图片字段
 */
function onScrapeImage(label: 'poster' | 'fanart' | 'thumb') {
    scraperField(
        video.value,
        props.webContent,
        toast,
        `parse${label.charAt(0).toUpperCase()}${label.slice(1)}` as keyof IScraperVideoFuncs,
        imageLabels[label]
    )
}
</script>

<template>
    <div>
        <div class="form-container" style="gap: 2rem; flex-direction: row; flex-wrap: wrap">
            <div v-for="label in Object.keys(imageLabels)" :key="label">
                <div style="display: flex; align-items: center">
                    <h2 style="margin-bottom: 1rem; text-align: center">
                        {{ imageLabels[label as 'poster' | 'fanart' | 'thumb'] }}
                    </h2>
                    <Button
                        v-tooltip="'搜索'"
                        icon="pi pi-search"
                        variant="outlined"
                        style="height: fit-content"
                        size="small"
                        @click="onScrapeImage(label as 'poster' | 'fanart' | 'thumb')"
                    />
                </div>

                <div
                    class="image-container"
                    @click="setPreviewImage(video[label as 'poster' | 'fanart' | 'thumb'])"
                    @dragover.prevent="(e) => handleDrag(e, 'over')"
                    @drop.prevent="(e) => handleDrop(e, label as 'poster' | 'fanart' | 'thumb')"
                    @dragenter.prevent="(e) => handleDrag(e, 'enter')"
                    @dragleave.prevent="(e) => handleDrag(e, 'leave')"
                >
                    <VideoImage
                        :img-data="video[label as 'poster' | 'fanart' | 'thumb']"
                        :style="{
                            height: '15rem'
                        }"
                        :error-image-style="{
                            padding: '2rem'
                        }"
                    />
                    <div class="image-overlay">
                        <p>拖入图片以更改</p>
                        <i class="pi pi-eye" />
                    </div>
                </div>
            </div>
        </div>

        <div class="form-container" style="gap: 0">
            <div style="display: flex; align-items: center; margin-top: var(--spacing)">
                <h2 style="margin-right: 5rem; margin-bottom: 1rem; text-align: center">剧照</h2>
                <Button
                    v-tooltip="'搜索'"
                    icon="pi pi-search"
                    variant="outlined"
                    style="height: fit-content"
                    size="small"
                    @click="
                        scraperField(video, props.webContent, toast, 'parseExtrafanart', '剧照')
                    "
                />
            </div>

            <Waterfall
                :list="extrafanartList"
                row-key="id"
                img-selector="src"
                :gutter="8"
                :breakpoints="{
                    1600: {
                        rowPerView: 5
                    },
                    1200: {
                        rowPerView: 4
                    },
                    900: {
                        rowPerView: 3
                    },
                    600: {
                        rowPerView: 2
                    }
                }"
            >
                <template #default="{ item, url }">
                    <div class="waterfall-image-item" @click="setPreviewImage(item.imgData)">
                        <LazyImg :url="url" />
                    </div>
                </template>
            </Waterfall>
        </div>

        <Teleport to="body">
            <Transition mode="out-in" name="fade">
                <div v-if="previewImage" class="preview-image-modal" @click="setPreviewImage(null)">
                    <VideoImage
                        :img-data="previewImage"
                        :image-style="{
                            width: '100%',
                            height: '100%',
                            objectFit: 'contain'
                        }"
                        :style="{
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            width: '90vw',
                            height: '90vh'
                        }"
                        border-radius="none"
                    />
                </div>
            </Transition>
        </Teleport>
    </div>
</template>

<style lang="scss" scoped>
.form-container {
    --spacing: 1.25rem;

    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 1rem;

    h2 {
        font-size: 1.2rem;
        font-weight: bold;
        margin: initial;
        margin-top: var(--spacing);
        padding-left: 0.5rem;
        color: var(--p-primary-color);
        margin-right: auto;
    }
}

.image-container {
    --border-color: var(--p-surface-400);

    cursor: pointer;
    position: relative;
    transition: all 0.3s var(--animation-type);
    border-radius: calc(var(--border-radius) * 2 + 5px);
    overflow: hidden;
    border: 4px dashed var(--border-color);
    padding: 4px;

    .image-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        opacity: 0;
        transition: all 0.3s var(--animation-type);
        background-color: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        color: var(--p-primary-inverse-color);

        p {
            position: absolute;
            top: 0;
        }

        i {
            font-size: 3rem;
        }
    }

    &:hover,
    &.dragover {
        .image-overlay {
            opacity: 1;
        }
    }

    &.dragover {
        --border-color: var(--p-primary-color);
    }
}

.waterfall-image-item {
    cursor: pointer;
    overflow: hidden;
    border-radius: calc(var(--border-radius) * 2);

    :deep(img) {
        width: 100%;
        display: block;
        transition: transform 0.3s var(--animation-type);
    }

    &:hover {
        :deep(img) {
            transform: scale(1.2);
        }
    }
}

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
