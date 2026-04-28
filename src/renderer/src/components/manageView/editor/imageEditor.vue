<script lang="ts" setup>
import type { IScraperVideoFuncs, IVideoFile } from '@renderer/scraper'

import { useMessage } from '@renderer/components/control/message'
import VideoImage from '@renderer/components/control/videoImage.vue'
import { ImageHelper, isUrl, NetHelper, PathHelper } from '@renderer/helper'
import { globalStatesStore } from '@renderer/stores'
import Button from 'primevue/button'
import ContextMenu from 'primevue/contextmenu'
import { computed, ref } from 'vue'
import { Waterfall } from 'vue-waterfall-plugin-next'

interface IProps {
    video: IVideoFile
    scraperField: (funcName: keyof IScraperVideoFuncs) => void
    buttondisable: boolean
    previewImage: string | null
}

const props = defineProps<IProps>()

const emit = defineEmits<{
    'update:video': [value: IVideoFile]
    'update:previewImage': [value: string | null]
}>()

const globalStates = globalStatesStore()
const message = useMessage()

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
    set: (value: string | null) => {
        emit('update:previewImage', value)
    }
})

const waterfallRef = ref<{ renderer: () => void } | null>(null)
const extrafanartContextMenu = ref()
const currentExtrafanart = ref<string | null>(null)

const extrafanartContextMenuItems = [
    {
        label: '删除当前剧照',
        icon: 'pi pi-trash',
        command: () => {
            removeCurrentExtrafanart()
        }
    }
]

/**
 * 剧照瀑布流数据
 */
const extrafanartList = computed(() =>
    (video.value.extrafanart || []).map((item, index) => ({
        id: index,
        imgData: item,
        src: ImageHelper.toLocalFileUrl(item, globalStates.imageCacheVersion)
    }))
)

/**
 * 同步预览图到父组件
 * @param value 预览图数据
 */
function setPreviewImage(value: string | null) {
    previewImage.value = value
}

/**
 * 图片加载后重排瀑布流，确保按原图比例显示
 */
function renderWaterfall() {
    waterfallRef.value?.renderer()
}

/**
 * 处理剧照加载失败
 * @param imgData 原始路径
 * @param url 图片地址
 */
function handleWaterfallImageError(imgData: string, url: string) {
    console.error('local-file 图片加载失败', {
        originalPath: imgData,
        imageUrl: url
    })
    renderWaterfall()
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
        [imageType]: filePath
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
    props.scraperField(
        `parse${label.charAt(0).toUpperCase()}${label.slice(1)}` as keyof IScraperVideoFuncs
    )
}

/**
 * 更新video中的图片字段
 * @param imageType 图片类型
 * @param imagePath 图片路径
 */
function updateVideoImage(
    imageType: 'poster' | 'fanart' | 'thumb' | 'extrafanart',
    imagePath: string
) {
    if (imageType === 'extrafanart') {
        video.value = {
            ...video.value,
            extrafanart: [...(video.value.extrafanart || []), imagePath]
        }
        return
    }

    video.value = {
        ...video.value,
        [imageType]: imagePath
    }
}

/**
 * 从剪切板中读取图片并添加
 * @param imageType 图片类型
 */
async function addImageFromClipboard(imageType: 'poster' | 'fanart' | 'thumb' | 'extrafanart') {
    try {
        const clipboardText = (await navigator.clipboard.readText()).trim()
        // 优先处理URL
        if (clipboardText && isUrl(clipboardText)) {
            const url = new URL(clipboardText)
            if (url.protocol === 'http:' || url.protocol === 'https:') {
                const re = await NetHelper.getImage(clipboardText)
                if (re.ok) {
                    const imagePath = await ImageHelper.saveTempImage(
                        re.body,
                        `${video.value.title}_${imageType}`
                    )
                    if (!imagePath) return

                    updateVideoImage(imageType, imagePath)
                    return
                }
            }
        }

        // 然后处理本地文件
        const path = PathHelper.newPath(clipboardText)
        if (clipboardText && (await path.isFile()) && (await path.isExist())) {
            updateVideoImage(imageType, clipboardText)
            return
        }

        // 最后处理图像数据
        const clipboardItems = await navigator.clipboard.read()
        for (const item of clipboardItems) {
            const imageTypeName = item.types.find((type) => type.startsWith('image/'))
            if (!imageTypeName) continue

            const blob = await item.getType(imageTypeName)
            if (blob instanceof File) {
                const filePath = await PathHelper.getPathForFile(blob)
                if (filePath) {
                    updateVideoImage(imageType, filePath)
                    return
                }
            }

            const imagePath = await ImageHelper.saveTempImage(
                await blob.arrayBuffer(),
                `${video.value.title}_${imageType}`
            )
            if (!imagePath) return

            updateVideoImage(imageType, imagePath)
            return
        }

        message.toast.warn('无法从剪切板中读取图片！')
    } catch {
        message.toast.error('无法从剪切板中读取图片！')
    }
}

/**
 * 超分当前图片并更新
 * @param imageType 图片类型
 */
async function handleSuperResolutionImage(imageType: 'poster' | 'fanart' | 'thumb') {
    message.confirmDialog.yesOrNo('是否超分当前图片?', async () => {
        const imagePath = video.value[imageType]
        if (!imagePath) return

        const tempImagePath = await ImageHelper.superResolutionImage(imagePath, true)
        if (!tempImagePath) return

        video.value = {
            ...video.value,
            [imageType]: tempImagePath
        }
    })
}

/**
 * 显示剧照右键菜单
 * @param event 鼠标事件
 * @param imagePath 剧照路径
 */
function showExtrafanartContextMenu(event: MouseEvent, imagePath: string) {
    currentExtrafanart.value = imagePath
    extrafanartContextMenu.value.show(event)
}

/**
 * 删除当前剧照
 */
function removeCurrentExtrafanart() {
    if (!currentExtrafanart.value) return

    video.value = {
        ...video.value,
        extrafanart: (video.value.extrafanart || []).filter(
            (item) => item !== currentExtrafanart.value
        )
    }
    currentExtrafanart.value = null
}

/**
 * 清空所有剧照
 */
function clearAllExtrafanart() {
    message.confirmDialog.yesOrNo('是否清空所有剧照?', () => {
        video.value = {
            ...video.value,
            extrafanart: []
        }
        currentExtrafanart.value = null
    })
}
</script>

<template>
    <div>
        <!-- 主图 -->
        <div class="form-container" style="gap: 2rem; flex-direction: row; flex-wrap: wrap">
            <div v-for="label in Object.keys(imageLabels)" :key="label">
                <div style="display: flex; align-items: center">
                    <h2 style="margin-bottom: 1rem; text-align: center">
                        {{ imageLabels[label as 'poster' | 'fanart' | 'thumb'] }}
                    </h2>
                    <Button
                        v-tooltip="'1、左键点击从剪切板中读取并添加\n2、右键点击超分当前图片'"
                        class="add-button"
                        icon="pi pi-plus"
                        variant="outlined"
                        style="height: fit-content"
                        size="small"
                        @click="addImageFromClipboard(label as 'poster' | 'fanart' | 'thumb')"
                        @contextmenu.prevent="
                            handleSuperResolutionImage(label as 'poster' | 'fanart' | 'thumb')
                        "
                    />
                    <Button
                        v-tooltip="'搜索'"
                        :disabled="buttondisable"
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
                        :src="video[label as 'poster' | 'fanart' | 'thumb']"
                        image-loading="eager"
                        image-decoding="async"
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

        <!-- 剧照图 -->
        <div class="form-container" style="gap: 0">
            <div style="display: flex; align-items: center; margin-top: var(--spacing)">
                <h2 style="margin-right: 1rem; margin-bottom: 1rem; text-align: center">剧照</h2>
                <Button
                    v-tooltip="'从剪切板中读取并添加'"
                    class="add-button"
                    icon="pi pi-plus"
                    variant="outlined"
                    style="height: fit-content"
                    size="small"
                    @click="addImageFromClipboard('extrafanart')"
                />
                <Button
                    v-tooltip="'搜索'"
                    :disabled="buttondisable"
                    icon="pi pi-search"
                    variant="outlined"
                    style="height: fit-content"
                    size="small"
                    @click="props.scraperField('parseExtrafanart')"
                />
                <Button
                    v-tooltip="'清空所有剧照'"
                    icon="pi pi-trash"
                    variant="outlined"
                    style="height: fit-content; margin-left: auto; margin-right: 0.5rem"
                    size="small"
                    @click="clearAllExtrafanart"
                />
            </div>

            <Waterfall
                ref="waterfallRef"
                :list="extrafanartList"
                row-key="id"
                img-selector="src"
                :check-images-loaded="true"
                :animation-duration="300"
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
                    <div
                        class="waterfall-image-item"
                        @click="setPreviewImage(item.imgData)"
                        @contextmenu.prevent="
                            showExtrafanartContextMenu($event as MouseEvent, item.imgData)
                        "
                    >
                        <img
                            :src="url"
                            loading="lazy"
                            decoding="async"
                            @load="renderWaterfall"
                            @error="handleWaterfallImageError(item.imgData, url)"
                        />
                    </div>
                </template>
            </Waterfall>

            <ContextMenu ref="extrafanartContextMenu" :model="extrafanartContextMenuItems" />
        </div>

        <!-- 预览图 -->
        <Teleport to="body">
            <Transition mode="out-in" name="fade">
                <div v-if="previewImage" class="preview-image-modal" @click="setPreviewImage(null)">
                    <VideoImage
                        :src="previewImage"
                        image-loading="eager"
                        image-decoding="sync"
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

.add-button {
    margin-right: 0.5rem;
}

.waterfall-image-item {
    cursor: pointer;
    overflow: hidden;
    border-radius: calc(var(--border-radius) * 2);

    :deep(img) {
        width: 100%;
        height: auto;
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
