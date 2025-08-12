import 'primeicons/primeicons.css'
import './style/main.scss'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { init } from '@neutralinojs/lib'
import PrimeVue from 'primevue/config'

import App from './App.vue'
import { theme } from '@/style/theme.ts'

createApp(App)
	.use(createPinia())
	.use(PrimeVue, {
		theme: {
			preset: theme
		}
	})
	.mount('#app')

init()

console.log(window.NL_ARCH)
