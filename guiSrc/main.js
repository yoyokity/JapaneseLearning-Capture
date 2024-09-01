import 'element-plus/dist/index.css'
import '@/css/main.css'

import ElementPlus from 'element-plus'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'

import App from './app.vue'
import WsClient from '../yo-electron-lib/webSocket/client.js'
import initGlobalFunction from '@/js/globalFunction/globalFunction.js'
import { Scraper, Settings } from '@/js/globalState/globalState.js'

//globalFunction
initGlobalFunction()

async function init () {
    //ws
    window.wsClient = new WsClient('mainWindow')
    await wsClient.connect()

    //vue
    const pinia = createPinia()
    pinia.use(piniaPluginPersistedstate)

    const app = createApp(App)
    app.use(pinia)
    app.use(ElementPlus)
    app.mount('#app')

    //后端设置初始化
    const settings = Settings()
    const scraper = Scraper()
    wsClient.onConnect(() => {
        settings.sendWS()
        scraper.load()
    })
}

init()
