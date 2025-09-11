<script lang="ts" setup>
import { Path, PathHelper } from '@renderer/helper'
import { CSSProperties, onMounted, ref, watch } from 'vue'
import imgFall from '@renderer/assets/img-fall.svg?url'

interface ImageProps {
	filePath: Path | null
	/**
	 * 图片的style
	 */
	imageStyle?: CSSProperties
}

const props = withDefaults(defineProps<ImageProps>(), {
	filePath: null,
	imageStyle: () => ({})
})

const isImgError = ref(true)
const imageData = ref<string>('')

/**
 * 加载图片
 */
async function loadImage() {
	// 先缓存要加载的图片路径
	const targetImage = props.filePath

	// 如果没有图片路径，直接设置错误状态
	if (!targetImage) {
		imageData.value = ''
		isImgError.value = true
		return
	}

	// 尝试加载新图片
	const newImageData = (await PathHelper.readImage(targetImage)) || ''

	// 只有在图片路径没有变化的情况下才更新状态（避免竞态条件）
	if (props.filePath === targetImage) {
		imageData.value = newImageData
		isImgError.value = !newImageData
	}
}

watch(() => props.filePath, loadImage)

onMounted(loadImage)
</script>

<template>
	<div :class="{ error: isImgError }" :style="{ ...imageStyle }" class="image">
		<img v-if="!isImgError" :src="imageData" class="video-card-img" />
		<img v-else :src="imgFall" class="video-card-img error" />
	</div>
</template>

<style lang="scss" scoped>
.image {
	overflow: hidden;
	border-radius: calc(var(--border-radius) * 2);
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
