import { IVideoFile } from '@renderer/components/manageView/type'
import { defineStore } from 'pinia'
import { computed, reactive, ref } from 'vue'
import { settingsStore } from './settings'

export const globalStatesStore = defineStore('globalStates', () => {
	/**
	 * 管理视图加载状态
	 */
	const manageViewLoading = ref(false)
	/**
	 * 管理视图文件列表
	 */
	const manageViewFiles = reactive<IVideoFile[]>([])
	function setManageViewFiles(files: IVideoFile[]) {
		manageViewFiles.splice(0, manageViewFiles.length, ...files)
	}

	/**
	 * 管理视图文件列表过滤值
	 */
	const manageViewFilesFilterValue = ref<string>('')

	const settings = settingsStore()

	/**
	 * 视频排序
	 */
	function videoSortFunc(a: IVideoFile, b: IVideoFile) {
		if (settings.manageViewSort === 'title') {
			return a.sorttitle.localeCompare(b.sorttitle, undefined, { sensitivity: 'base' })
		} else if (settings.manageViewSort === 'releasedate') {
			return a.releasedate.localeCompare(b.releasedate, undefined, { sensitivity: 'base' })
		} else if (settings.manageViewSort === 'title_reverse') {
			return b.sorttitle.localeCompare(a.sorttitle, undefined, { sensitivity: 'base' })
		} else if (settings.manageViewSort === 'releasedate_reverse') {
			return b.releasedate.localeCompare(a.releasedate, undefined, { sensitivity: 'base' })
		}
		return 0
	}
	/**
	 * 管理视图文件列表过滤后的，筛选+排序 后的文件列表
	 */
	const manageViewFilesFilter = computed(() => {
		if (manageViewFilesFilterValue.value.trim() !== '') {
			return (
				manageViewFiles.filter((file) => {
					return (
						file.title.includes(manageViewFilesFilterValue.value) ||
						file.originaltitle.includes(manageViewFilesFilterValue.value) ||
						file.sorttitle.includes(manageViewFilesFilterValue.value) ||
						file.set.toString().includes(manageViewFilesFilterValue.value)
					)
				}) as IVideoFile[]
			).sort(videoSortFunc)
		} else {
			return [...(manageViewFiles as IVideoFile[])].sort(videoSortFunc)
		}
	})

	return {
		manageViewFiles,
		setManageViewFiles,
		manageViewLoading,
		manageViewFilesFilter,
		manageViewFilesFilterValue
	}
})
