<script lang="ts" setup>
import Select, { type SelectChangeEvent } from 'primevue/select'
import { Scraper } from '@renderer/scraper'
import Button from 'primevue/button'
import { scanFiles } from './func'
import ScrollPanel from 'primevue/scrollpanel'
import VideoCard from './videoCard.vue'
import { IVideoFile } from './type'
import { globalStatesStore, settingsStore } from '@renderer/stores'

const settings = settingsStore()
const globalStates = globalStatesStore()

//开始搜索文件
async function startScan() {
	globalStates.manageViewFiles = await scanFiles(settings.scraperPath[settings.currentScraper])
}

//重新选择目录后，清除文件列表
function clearFiles(e: SelectChangeEvent) {
	if (e.value !== settings.currentScraper) {
		globalStates.manageViewFiles = []
	}
}
</script>

<template>
	<div class="manage-view">
		<div class="manage-view-header">
			<h3>管理</h3>
			<Select
				v-model="settings.currentScraper"
				v-tooltip.left="{
					value: '选择目录',
					showDelay: 700
				}"
				:options="Scraper.instances.map((scraper) => scraper.scraperName)"
				size="small"
				style="width: 8rem"
				@change="clearFiles"
			/>
			<Button
				:loading="globalStates.manageViewLoading"
				icon="pi pi-refresh"
				label="开始扫描"
				size="small"
				style="width: 7rem"
				@click="startScan"
			/>
		</div>
		<ScrollPanel style="height: calc(100% - var(--header-height))">
			<div class="manage-view-content">
				<VideoCard
					v-for="file in globalStates.manageViewFiles"
					:video="file as IVideoFile"
				/>
			</div>
		</ScrollPanel>

		<!--浮动块-->
		<div></div>
	</div>
</template>

<style lang="scss" scoped>
.manage-view {
	width: 100%;
	height: 100%;
}

.manage-view-header {
	width: 100%;
	height: var(--header-height);
	border-bottom: var(--separator);
	display: flex;
	align-items: center;
	padding: 0 1.5rem;
	gap: 1rem;

	h3 {
		font-weight: normal;
		margin-right: auto;
	}
}

.manage-view-content {
	padding: 1.25rem;
	display: grid;
	/* 根据容器宽度自动调整列数，最小宽度为150px，最大为1fr */
	grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
	/* 设置行间距和列间距 */
	gap: 1rem;
	/* 确保网格项目保持一致的宽高比 */
	grid-auto-flow: dense; /* 使用dense填充算法，减少空白 */
}
</style>
