import { defineStore } from 'pinia'
import { reactive } from 'vue'

export const settingsStore = defineStore(
	'settings',
	() => {
		// 代理
		const proxy = reactive({
			enable: true,
			host: '127.0.0.1',
			port: '7890'
		})

		// 网络
		const net = reactive({
			/**
			 * 请求超时时间
			 */
			timeout: 7000,
			/**
			 * 重试次数
			 */
			retry: 3,
			/**
			 * 每次相同网站的请求间隔
			 */
			delay: 3000
		})

		return {
			proxy,
			net
		}
	},
	{
		persist: true
	}
)
