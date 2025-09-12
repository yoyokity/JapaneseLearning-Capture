<script lang="ts" setup>
import { IVideoFile } from '@renderer/scraper'
import { computed } from 'vue'
import { openEditorDialog } from './func'
import VideoImage from '@renderer/components/control/videoImage.vue'
import { useDialog } from 'primevue/usedialog'
import { useToast } from 'primevue/usetoast'

const emit = defineEmits<{
	showMenu: [event: MouseEvent, video: IVideoFile]
}>()

const props = defineProps<{
	video: IVideoFile
}>()

const dialog = useDialog()
const toast = useToast()

const name = computed(() => {
	return props.video.title || props.video.fileName
})
const image = computed(() => {
	return props.video.poster || props.video.fanart || props.video.thumb
})

function showEditor() {
	openEditorDialog(props.video, dialog, toast)
}

function onContextmenu(event: MouseEvent) {
	emit('showMenu', event, props.video)
}
</script>

<template>
	<div class="video-card" @click="showEditor" @contextmenu="onContextmenu">
		<VideoImage :filePath="image" style="aspect-ratio: 379 / 538" />
		<div v-tooltip.bottom="{ value: name, showDelay: 500 }" class="video-card-title">
			{{ name }}
		</div>
	</div>
</template>

<style lang="scss" scoped>
.video-card {
	user-select: none;
	-webkit-user-drag: none;
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
