<script lang="ts" setup>
import { ImageHelper, NetHelper, Path } from '@renderer/helper'
import { CSSProperties, onMounted, ref, watch } from 'vue'
import imgFall from '@renderer/assets/img-fall.svg?url'

interface ImageProps {
	filePath: Path | URL | null
	/**
	 * 内部图片样式
	 */
	imageStyle?: CSSProperties
	borderRadius?: CSSProperties['borderRadius']
}

const props = withDefaults(defineProps<ImageProps>(), {
	filePath: null,
	imageStyle: () => ({}),
	borderRadius: 'calc(var(--border-radius) * 2)'
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
	let newImageData = ''
	if (targetImage instanceof URL) {
		// 通过URL获取图片并转换为base64
		const response = await NetHelper.get(targetImage.toString(), 'buffer')
		if (response.ok && response.body) {
			// 从响应头获取MIME类型，如果没有则默认为image/jpeg
			const contentType = response.headers['content-type'] || 'image/jpeg'
			// 将buffer转换为base64字符串
			const base64String = Buffer.from(response.body).toString('base64')
			// 拼接成data URL格式
			newImageData = `data:${contentType};base64,${base64String}`
		}
	} else {
		// 通过路径读取图片
		newImageData = (await ImageHelper.readImage(targetImage)) || ''
	}

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
	<div :class="{ error: isImgError }" class="image">
		<img v-if="!isImgError" :src="imageData" :style="imageStyle" class="video-card-img" />
		<img v-else :src="imgFall" :style="imageStyle" class="video-card-img error" />
	</div>
</template>

<style lang="scss" scoped>
.image {
	overflow: hidden;
	border-radius: v-bind(borderRadius);
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
