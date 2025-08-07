import './style/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

import { init } from '@neutralinojs/lib'

createApp(App)
    .use(createPinia())
    .mount('#app')

init()

console.log(window.NL_ARCH)