import 'primeicons/primeicons.css'
import '@renderer/style/primeVue.scss'
import '@renderer/style/main.scss'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'

import App from '@renderer/App.vue'
import { theme } from '@renderer/style/theme'
import { Ipc } from '@renderer/ipc'
import { DebugHelper } from '@renderer/helper'

console.log(await Ipc.check())
console.log(await Ipc.filesystem.appPath())
console.log(await DebugHelper.executeWithTime(Ipc.filesystem.arsrPath))

createApp(App)
	.use(createPinia())
	.use(PrimeVue, {
		theme: {
			preset: theme
		}
	})
	.mount('#app')
