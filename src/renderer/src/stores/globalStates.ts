import { IVideoFile } from '@renderer/components/manageView/type'
import { defineStore } from 'pinia'
import { reactive, ref, watch } from 'vue'

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
	/**
	 * 管理视图文件列表过滤后的
	 */
	const manageViewFilesFilter = reactive<IVideoFile[]>([])
	function setManageViewFilesFilter(files: IVideoFile[]) {
		manageViewFilesFilter.splice(0, manageViewFilesFilter.length, ...files)
	}

	//文件列表发生变化时，过滤后的文件列表也发生变化
	watch(manageViewFiles, () => {
		if (manageViewFilesFilterValue.value.trim() !== '') {
			const filter = manageViewFiles.filter((file) => {
				return (
					file.title.includes(manageViewFilesFilterValue.value) ||
					file.originaltitle.includes(manageViewFilesFilterValue.value) ||
					file.sorttitle.includes(manageViewFilesFilterValue.value) ||
					file.set.toString().includes(manageViewFilesFilterValue.value)
				)
			})
			setManageViewFilesFilter(filter as IVideoFile[])
		} else {
			setManageViewFilesFilter(manageViewFiles as IVideoFile[])
		}
	})

	//过滤值发生变化时，过滤后的文件列表也发生变化
	watch(manageViewFilesFilterValue, () => {
		if (manageViewFilesFilterValue.value.trim() !== '') {
			const filter = manageViewFiles.filter((file) => {
				return (
					file.title.includes(manageViewFilesFilterValue.value) ||
					file.originaltitle.includes(manageViewFilesFilterValue.value) ||
					file.sorttitle.includes(manageViewFilesFilterValue.value) ||
					file.set.toString().includes(manageViewFilesFilterValue.value)
				)
			})
			setManageViewFilesFilter(filter as IVideoFile[])
		} else {
			setManageViewFilesFilter(manageViewFiles as IVideoFile[])
		}
	})

	return {
		manageViewFiles,
		setManageViewFiles,
		manageViewLoading,
		manageViewFilesFilter,
		manageViewFilesFilterValue,
		setManageViewFilesFilter
	}
})
