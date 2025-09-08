<script setup lang="ts">
import { IVideoFile } from './type'
import imgFall from '@renderer/assets/img-fall.svg?url'
import { computed, ref } from 'vue'

const props = defineProps<{
	video: IVideoFile
}>()

const isImgError = ref(false)

function handleImgError() {
	isImgError.value = true
}

const name = computed(() => {
	return props.video.title || props.video.fileName
})
</script>

<template>
	<div class="video-card" v-tooltip.top="{ value: name, showDelay: 500 }">
		<div
			class="video-card-img-container"
			:path="props.video.poster"
			:class="{ error: isImgError }"
		>
			<img
				v-if="!isImgError"
				class="video-card-img"
				:src="`local-file:///${encodeURI(props.video.poster)}`"
				@error="handleImgError"
			/>
			<img v-else class="video-card-img error" :src="imgFall" />
		</div>
		<div class="video-card-title">{{ name }}</div>
	</div>
</template>

<style scoped lang="scss">
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
