<script lang="ts" setup>
import type { IVideoFile } from '@renderer/scraper'

import VideoImage from '@renderer/components/control/videoImage.vue'
import Editor from '@renderer/components/manageView/editor/editor.vue'
import { useDialog } from 'primevue/usedialog'
import { computed } from 'vue'

const props = defineProps<{
    video: IVideoFile
    title?: string
    fileNum?: number
    hasVideoNum?: boolean
    imageBorder?: string
    onClick?: (video: IVideoFile, event: MouseEvent) => void
}>()

const dialog = useDialog()

const name = computed(() => {
    return props.title || props.video.title || props.video.fileName
})
const image = computed(() => {
    return props.video.poster || props.video.fanart || props.video.thumb
})

function openEditor() {
    dialog.open(Editor, {
        props: {
            modal: true,
            draggable: false,
            showHeader: false,
            style: {
                width: 'fit-content',
                maxWidth: '90vw'
            },
            contentStyle: {
                overflow: 'initial'
            }
        },
        data: {
            video: props.video
        }
    })
}

/**
 * 点击卡片
 */
function handleClick(event: MouseEvent) {
    if (props.onClick) {
        props.onClick(props.video, event)
        return
    }

    openEditor()
}
</script>

<template>
    <div class="video-card" @click="handleClick">
        <!-- 视频编号缺失提示 -->
        <div
            v-if="hasVideoNum !== true"
            v-tooltip.top="'视频编号缺失，需要刮削'"
            class="video-num-missing"
        >
            ?
        </div>
        <!-- 图片 -->
        <VideoImage
            :src="image"
            :num="fileNum"
            :border="imageBorder"
            image-loading="lazy"
            image-decoding="async"
            style="aspect-ratio: 379 / 538"
        />
        <!-- 标题 -->
        <div v-tooltip.bottom="name" class="video-card-title">
            {{ name }}
        </div>
    </div>
</template>

<style lang="scss" scoped>
.video-card {
    user-select: none;
    cursor: pointer;
    position: relative;

    .video-num-missing {
        position: absolute;
        top: 0.5rem;
        left: 0.5rem;
        width: 1.4rem;
        height: 1.4rem;
        border-radius: 50%;
        background: rgba(0, 0, 0, 0.8);
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.9rem;
        font-weight: bold;
        z-index: 1;
    }

    .video-card-title {
        text-align: center;
        max-height: 2.4em;
        line-height: 1.2;
        overflow: hidden;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        line-clamp: 2;
        -webkit-box-orient: vertical;
        text-overflow: ellipsis;
        margin-top: 0.5rem;
        margin-bottom: 1rem;
        transition: transform 0.3s var(--animation-type);
    }

    &:hover {
        :deep(.video-card-img) {
            transform: scale(1.2);
        }

        .video-card-title {
            color: var(--p-primary-active-color);
        }
    }
}
</style>
