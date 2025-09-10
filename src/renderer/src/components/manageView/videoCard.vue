<script lang="ts" setup>
import { IVideoFile } from './type'
import { computed } from 'vue'
import { useDialog } from 'primevue/usedialog'
import Editor from './editor.vue'
import Image from '@renderer/components/control/videoImage.vue'

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

function showEditor() {
	dialog.open(Editor, {
		props: {
			modal: true,
			draggable: false,
			showHeader: false,
			contentStyle: {
				marginBottom: '4.5rem',
				marginTop: 'var(--header-height)'
			}
		},
		data: {
			video: props.video
		}
	})
}

function onContextmenu(event: MouseEvent) {
	emit('showMenu', event, props.video)
}
</script>

<template>
	<div class="video-card" @click="showEditor" @contextmenu="onContextmenu">
		<Image :filePath="image" />
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
		.video-card-img {
			transform: scale(1.2);
		}

		.video-card-title {
			color: var(--p-primary-active-color);
		}
	}
}
</style>
