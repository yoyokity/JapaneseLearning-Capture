import 'primeicons/primeicons.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import PrimeVue from 'primevue/config'
import Tooltip from 'primevue/tooltip'
import ToastService from 'primevue/toastservice'

import App from '@renderer/App.vue'
import { theme } from '@renderer/style/theme'
import { DebugHelper, PathHelper } from '@renderer/helper'

DebugHelper.log('============================')
DebugHelper.log('应用初始化中...')
await PathHelper.init()

const pinia = createPinia().use(piniaPluginPersistedstate)
const app = createApp(App)
app.use(pinia)
	.use(PrimeVue, {
		theme: {
			preset: theme
		}
	})
	.use(ToastService)
	.directive('tooltip', Tooltip)

// 动态导入，确保它是最后加载的样式
import('@renderer/style/main.scss')
import('@renderer/style/primeVue.scss')

app.mount('#app')
DebugHelper.info('应用初始化完成')
