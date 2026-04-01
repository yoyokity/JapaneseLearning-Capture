import App from '@renderer/App.vue'
import { DebugHelper, PathHelper } from '@renderer/helper'
import { Scraper } from '@renderer/scraper'
import { settingsStore } from '@renderer/stores'
import { theme } from '@renderer/style/theme'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import PrimeVue from 'primevue/config'
import ConfirmationService from 'primevue/confirmationservice'
import DialogService from 'primevue/dialogservice'
import ToastService from 'primevue/toastservice'
import Tooltip from 'primevue/tooltip'
import { createApp } from 'vue'

import 'vue-waterfall-plugin-next/dist/style.css'
import 'primeicons/primeicons.css'

DebugHelper.log('============================')
DebugHelper.log('应用初始化中...')

async function initApp() {
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
        .use(DialogService)
        .use(ConfirmationService)
        .directive('tooltip', Tooltip)

    // 动态导入，确保它是最后加载的样式
    import('@renderer/style/main.scss')
    import('@renderer/style/primeVue.scss')

    app.mount('#app')

    //刮削器初始化
    const settings = settingsStore()
    Scraper.instances.forEach((scraper) => {
        DebugHelper.info(`刮削器已加载：${scraper.scraperName}`)
        // 初始化刮削器路径缺省值为output
        settings.scraperPath[scraper.scraperName] =
            settings.scraperPath[scraper.scraperName] || '/output'
    })

    // 初始化当前刮削器缺省值为第一个刮削器
    settings.currentScraper = settings.currentScraper || Scraper.instances[0].scraperName

    DebugHelper.info('应用初始化完成')
}

initApp()
