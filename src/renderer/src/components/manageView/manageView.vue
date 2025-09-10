<script lang="ts" setup>
import Select, { type SelectChangeEvent } from 'primevue/select'
import { Scraper } from '@renderer/scraper'
import Button from 'primevue/button'
import ScrollTop from 'primevue/scrolltop'
import { startScan } from './func'
import ScrollPanel from 'primevue/scrollpanel'
import VideoCard from './videoCard.vue'
import { IVideoFile } from './type'
import { globalStatesStore, settingsStore, VideoSortTypeList } from '@renderer/stores'
import { computed, ref } from 'vue'
import ContextMenu from 'primevue/contextmenu'
import { PathHelper } from '@renderer/helper'
import InputText from 'primevue/inputtext'

const settings = settingsStore()
const globalStates = globalStatesStore()
const cm = ref()
const currentVideo = ref<IVideoFile | null>(null)

const isSortActive = ref(false)
const isSearchActive = ref(false)
const isFloatActive = computed(() => isSortActive.value || isSearchActive.value)

// 右键菜单项
const menuItems = ref([
	{
		label: '播放',
		icon: 'pi pi-play-circle',
		command: () => {
			if (currentVideo.value) {
				PathHelper.openInExplorer(currentVideo.value.path.toString())
			}
		}
	},
	{
		label: '打开文件夹',
		icon: 'pi pi-folder-open',
		command: () => {
			if (currentVideo.value) {
				PathHelper.openInExplorer(currentVideo.value.dir.toString())
			}
		}
	}
])

//重新选择目录后，清除文件列表
function clearFiles(e: SelectChangeEvent) {
	if (e.value !== settings.currentScraper) {
		globalStates.manageViewFiles = []
	}
}

//重新排序
function handleSortChange(e: SelectChangeEvent) {
	settings.manageViewSort = e.value
}

/**
 * 显示右键菜单
 */
function showMenu(event: MouseEvent, video: IVideoFile) {
	currentVideo.value = video
	cm.value.show(event)
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
				<!-- 卡片视图 -->
				<VideoCard
					v-for="file in globalStates.manageViewFilesFilter"
					:video="file as IVideoFile"
					@show-menu="showMenu"
				/>
			</div>
			<ScrollTop
				:buttonProps="{ severity: 'secondary', raised: true, rounded: true, size: 'small' }"
				:threshold="100"
				icon="pi pi-arrow-up"
				target="parent"
			/>
		</ScrollPanel>

		<!--灵动岛-->
		<div v-if="globalStates.manageViewFiles.length > 0" class="manage-view-float">
			<div :class="{ active: isFloatActive }" class="manage-view-float-content">
				<!-- 搜索 -->
				<i
					v-tooltip.top="{
						value: '搜索',
						showDelay: 500
					}"
					:class="{ active: isSearchActive }"
					class="search-button pi pi-search"
					@click="
						() => {
							isSearchActive = !isSearchActive
							globalStates.manageViewFilesFilterValue = ''
						}
					"
				/>
				<transition name="search-animation">
					<div v-show="isSearchActive" class="search-input-container">
						<InputText
							v-model="globalStates.manageViewFilesFilterValue"
							class="search-input"
							placeholder="搜索"
							size="small"
							@blur="
								() => {
									if (globalStates.manageViewFilesFilterValue.trim() === '') {
										isSearchActive = false
									}
								}
							"
						/>
					</div>
				</transition>

				<!-- 排序 -->
				<Select
					v-model="settings.manageViewSort"
					v-tooltip.top="{
						value: '排序',
						showDelay: 500
					}"
					:option-label="(option) => VideoSortTypeList[option]"
					:options="Object.keys(VideoSortTypeList)"
					class="sort-select"
					dropdown-icon="pi pi-sort-amount-down"
					size="small"
					@change="handleSortChange"
					@hide="isSortActive = false"
					@show="isSortActive = true"
				/>
			</div>
		</div>

		<!-- 全局右键菜单 -->
		<ContextMenu ref="cm" :model="menuItems" />
	</div>
</template>

<style lang="scss" scoped>
.manage-view {
	width: 100%;
	height: 100%;
	position: relative;
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

.manage-view-float {
	position: absolute;
	left: 0;
	bottom: 0;
	width: 100%;
	display: flex;
	justify-content: center;

	.manage-view-float-content {
		z-index: 2;
		display: flex;
		align-items: center;
		justify-content: center;
		background-color: var(--p-surface-200);
		margin-bottom: 1rem;
		border-radius: 10rem;
		padding: 0 0.5rem;
		height: 2rem;
		transition: all 0.2s ease-in-out;
		opacity: 0.8;
		cursor: pointer;

		&:hover,
		&.active {
			opacity: 1;
			background-color: var(--p-surface-0);
			box-shadow: 0 0 10px 0 rgba(0, 0, 0, 0.3);
		}

		.search-button {
			color: var(--p-text-muted-color);
			transition: color 0.3s var(--animation-type);
			margin-right: 0.25rem;

			&:hover,
			&.active {
				color: var(--p-primary-color);
			}
		}

		.search-input-container {
			width: 10rem;
			height: 1.5rem;
			overflow: hidden;

			.search-input {
				width: 100%;
				height: 100%;
				border-radius: 10rem;
				padding: 0 0.5rem;
			}
		}

		.sort-select {
			--p-select-dropdown-width: 100%;
			--p-select-dropdown-color: var(--p-text-muted-color);

			width: 1rem;
			border: none !important;
			background: transparent !important;
			transition: color 0.3s var(--animation-type);
			margin-left: 0.25rem;

			:deep(.p-select-label) {
				display: none;
			}

			&:hover {
				--p-select-dropdown-color: var(--p-primary-color);
			}
		}
	}
}

.search-animation-enter-active,
.search-animation-leave-active {
	transition: all 0.3s var(--animation-type);
	max-width: 10rem;
}

.search-animation-enter-from,
.search-animation-leave-to {
	max-width: 0;
	opacity: 0;
}

.search-animation-enter-to,
.search-animation-leave-from {
	max-width: 10rem;
	opacity: 1;
}
</style>
