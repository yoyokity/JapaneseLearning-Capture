import 'primeicons/primeicons.css'
import '@/style/primeVue.scss'
import '@/style/main.scss'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { init } from '@neutralinojs/lib'
import PrimeVue from 'primevue/config'

import App from './App.vue'
import { theme } from '@/style/theme.ts'
import { DebugHelper, HttpHelper, initHelper } from '@/helper'
import { TransHelper } from '@/helper/TransHelper.ts'

initHelper()

createApp(App)
	.use(createPinia())
	.use(PrimeVue, {
		theme: {
			preset: theme
		}
	})
	.mount('#app')

init()

DebugHelper.success('初始化完成，开始运行')
