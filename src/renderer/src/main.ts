import 'primeicons/primeicons.css'
import '@renderer/style/primeVue.scss'
import '@renderer/style/main.scss'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'

import App from '@renderer/App.vue'
import { theme } from '@renderer/style/theme'
import { DebugHelper } from '@renderer/helper'
import { PathHelper } from '@renderer/helper/PathHelper.ts'

DebugHelper.log('============================')
DebugHelper.log('应用初始化中...')
await PathHelper.init()

createApp(App)
	.use(createPinia())
	.use(PrimeVue, {
		theme: {
			preset: theme
		}
	})
	.mount('#app')

DebugHelper.info('应用初始化完成')
