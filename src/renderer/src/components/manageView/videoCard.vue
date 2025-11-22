<script lang="ts" setup>
import { IVideoFile, Scraper } from '@renderer/scraper'
import { computed, ref } from 'vue'
import VideoImage from '@renderer/components/control/VideoImage.vue'
import Editor from './editor.vue'
import Dialog from '@renderer/components/control/dialog/Dialog.vue'
import { isEqual } from 'es-toolkit'
import { useToast } from 'primevue/usetoast'
import { scanFiles } from './func'
import { PathHelper } from '@renderer/helper'

const emit = defineEmits<{
	showMenu: [event: MouseEvent, video: IVideoFile]
}>()

const props = defineProps<{
	video: IVideoFile
}>()

const showEditorDialog = ref(false)
const isSaving = ref(false)
const toast = useToast()

const name = computed(() => {
	return props.video.title || props.video.fileName
})
const image = computed(() => {
	return props.video.poster || props.video.fanart || props.video.thumb
})

function onContextmenu(event: MouseEvent) {
	emit('showMenu', event, props.video)
}

//编辑窗口关闭传回
async function onClose(data: any = null) {
	if (!data) return

	//对话框点击保存
	const newVideo = data as IVideoFile
	const sourceVideoFile = props.video
	const scraper = Scraper.getCurrentScraperInstance()

	if (!scraper) return

	console.log('scraperPath', Scraper.getCurrentScraperPath())
	console.log('sourceVideoFile', sourceVideoFile)
	console.log('newVideo', newVideo)

	//如果视频没有修改，则不保存
	if (isEqual(newVideo, sourceVideoFile)) {
		toast.add({
			severity: 'success',
			summary: '未修改，无需保存',
			life: 3000
		})
		return
	}

	if (isSaving.value) return
	isSaving.value = true

	//创建目录
	const videoDir = await scraper.createDirectory(
		PathHelper.newPath(Scraper.getCurrentScraperPath()),
		newVideo,
		sourceVideoFile
	)
	if (!videoDir) {
		toast.add({
			severity: 'error',
			summary: '保存失败！',
			life: 3000
		})
		return
	}

	//处理图片
	await scraper.downloadImage(videoDir, newVideo)

	//删除空文件夹
	await PathHelper.removeEmptyFolders(Scraper.getCurrentScraperPath())

	//重新扫描文件
	await scanFiles(toast)

	toast.add({
		severity: 'success',
		summary: '保存成功！',
		life: 3000
	})

	isSaving.value = false
}
</script>

<template>
	<div class="video-card" @click="showEditorDialog = true" @contextmenu="onContextmenu">
		<VideoImage :filePath="image" style="aspect-ratio: 379 / 538" />
		<div v-tooltip.bottom="{ value: name, showDelay: 500 }" class="video-card-title">
			{{ name }}
		</div>
	</div>
	<Dialog v-model:visible="showEditorDialog" @close="onClose">
		<Editor :video="props.video" :isSaving="isSaving" />
	</Dialog>
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
