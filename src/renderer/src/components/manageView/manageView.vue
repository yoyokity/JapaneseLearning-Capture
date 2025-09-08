<script setup lang="ts">
import Select from 'primevue/select'
import { Scraper } from '@renderer/scraper'
import { settingsStore } from '@renderer/stores/settings'
import Button from 'primevue/button'

const settings = settingsStore()
</script>

<template>
	<div class="manage-view">
		<div class="manage-view-header">
			<h3>管理</h3>
			<Select
				v-model="settings.currentScraper"
				:options="Scraper.instances.map((scraper) => scraper.scraperName)"
				size="small"
				style="width: 8rem"
				v-tooltip="'选择目录'"
			/>
			<Button icon="pi pi-inbox" label="开始扫描" size="small" />
		</div>
	</div>
</template>

<style scoped lang="scss">
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
</style>
