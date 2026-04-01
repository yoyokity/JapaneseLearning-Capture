<script lang="ts" setup>
import type { IVideoFile } from '@renderer/scraper'

import VideoImage from '@renderer/components/control/VideoImage.vue'
import { useDialog } from 'primevue/usedialog'
import { computed } from 'vue'

import Editor from './editor/editor.vue'

const props = defineProps<{
    video: IVideoFile
}>()

const emit = defineEmits<{
    showMenu: [event: MouseEvent, video: IVideoFile]
}>()

const dialog = useDialog()

const name = computed(() => {
    return props.video.title || props.video.fileName
})
const image = computed(() => {
    return props.video.poster || props.video.fanart || props.video.thumb
})

function onContextmenu(event: MouseEvent) {
    emit('showMenu', event, props.video)
}

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
</script>

<template>
    <div class="video-card" @click="openEditor" @contextmenu="onContextmenu">
        <VideoImage :img-data="image" style="aspect-ratio: 379 / 538" />
        <div v-tooltip.bottom="{ value: name, showDelay: 500 }" class="video-card-title">
            {{ name }}
        </div>
    </div>
</template>

<style lang="scss" scoped>
.video-card {
    user-select: none;
    cursor: pointer;
    position: relative;

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
