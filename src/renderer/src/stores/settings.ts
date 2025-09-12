import { defineStore } from 'pinia'
import { reactive, ref, watch } from 'vue'
import { NetHelper } from '@renderer/helper'
import { ITranslateSettings } from '@renderer/helper/TransHelper.ts'
import { Scraper } from '@renderer/scraper'

export type VideoSortType = keyof typeof VideoSortTypeList
export const VideoSortTypeList = {
	title: '标题名称',
	title_reverse: '标题名称 (倒序)',
	releasedate: '发布日期',
	releasedate_reverse: '发布日期 (倒序)'
} as const

export const settingsStore = defineStore(
	'settings',
	() => {
		// 代理
		const proxy = reactive({
			enable: true,
			host: '127.0.0.1',
			port: 7890
		})

		// 监听 proxy 的变化，自动设置
		watch(
			proxy,
			(newValue) => {
				NetHelper.setProxy(newValue.enable, newValue.host, newValue.port.toString())
			},
			{
				// 在 Store 初始化时立即执行一次，并监听后续变化
				immediate: true,
				// 深度监听，确保所有嵌套属性的变化都能被捕获
				deep: true
			}
		)

		// 网络
		const net = reactive({
			/**
			 * 请求超时时间
			 */
			timeout: 7,
			/**
			 * 重试次数
			 */
			retry: 3,
			/**
			 * 每次相同网站的请求间隔
			 */
			delay: 3000
		})

		//翻译
		const translate = reactive<ITranslateSettings>({
			enable: false,
			retryWithGoogle: true,
			targetLanguage: 'zh-CN',
			translateEngine: 'google',
			gemini: {
				apiKey: '',
				model: 'gemini-2.5-flash-lite'
			},
			localLLM: {
				host: '127.0.0.1',
				port: 1234,
				model: ''
			}
		})

		const scraperPath = reactive<Record<string, string>>({})
		const currentScraper = ref('')
		const manageViewSort = ref<VideoSortType>('title')

		return {
			proxy,
			net,
			translate,
			/**
			 * 刮削器路径设置
			 */
			scraperPath,
			/**
			 * 当前刮削器名称
			 */
			currentScraper,
			/**
			 * 当前刮削器实例
			 */
			get currentScraperInstance() {
				return Scraper.instances.find(
					(scraper) => scraper.scraperName === currentScraper.value
				)
			},
			/**
			 * 管理视图排序
			 */
			manageViewSort
		}
	},
	{
		persist: true
	}
)
