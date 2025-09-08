import { IVideoFile } from '@renderer/components/manageView/type'
import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'

export const globalStatesStore = defineStore('globalStates', () => {
	/**
	 * 管理视图文件列表
	 */
	const manageViewFiles = reactive<IVideoFile[]>([])

	/**
	 * 管理视图加载状态
	 */
	const manageViewLoading = ref(false)

	return {
		manageViewFiles,
		manageViewLoading
	}
})
