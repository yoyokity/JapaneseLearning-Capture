<script lang="ts" setup>
import { IVideoFile } from './type'
import imgFall from '@renderer/assets/img-fall.svg?url'
import { computed, onMounted, ref, watch } from 'vue'
import { useDialog } from 'primevue/usedialog'
import { PathHelper } from '@renderer/helper'
import Editor from './editor.vue'

const props = defineProps<{
	video: IVideoFile
}>()

const emit = defineEmits<{
	showMenu: [event: MouseEvent, video: IVideoFile]
}>()

const dialog = useDialog()
const isImgError = ref(true)

const name = computed(() => {
	return props.video.title || props.video.fileName
})
const image = computed(() => {
	return props.video.poster || props.video.fanart || props.video.thumb
})
const imageData = ref<string>('')

function showEditor() {
	dialog.open(Editor, {
		props: {
			header: '编辑信息',
			modal: true,
			draggable: false
		},
		data: {
			video: props.video
		}
	})
}

/**
 * 加载图片
 */
async function loadImage() {
	// 先缓存要加载的图片路径
	const targetImage = image.value

	// 如果没有图片路径，直接设置错误状态
	if (!targetImage) {
		imageData.value = ''
		isImgError.value = true
		return
	}

	// 尝试加载新图片
	const newImageData = (await PathHelper.readImage(targetImage)) || ''

	// 只有在图片路径没有变化的情况下才更新状态（避免竞态条件）
	if (image.value === targetImage) {
		imageData.value = newImageData
		isImgError.value = !newImageData
	}
}

//加载图片
onMounted(loadImage)

// 监听video的poster/fanart/thumb变化，重新加载图片
watch(() => [props.video.poster, props.video.fanart, props.video.thumb], loadImage)

function onContextmenu(event: MouseEvent) {
	emit('showMenu', event, props.video)
}
</script>

<template>
	<div class="video-card" @click="showEditor" @contextmenu="onContextmenu">
		<div :class="{ error: isImgError }" :path="image" class="video-card-img-container">
			<img v-if="!isImgError" :src="imageData" class="video-card-img" />
			<img v-else :src="imgFall" class="video-card-img error" />
		</div>
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

	.video-card-img-container {
		aspect-ratio: 379 / 538; //保持长宽比
		border-radius: calc(var(--border-radius) * 2);
		overflow: hidden;

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
