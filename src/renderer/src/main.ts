import App from '@renderer/App.vue'
import Tooltip from '@renderer/components/control/tooltip'
import { preScan } from '@renderer/components/manageView/hook'
import { LogHelper, PathHelper, TransHelper } from '@renderer/helper'
import { Scraper } from '@renderer/scraper'
import { globalStatesStore, settingsStore } from '@renderer/stores'
import { theme } from '@renderer/style/theme'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import PrimeVue from 'primevue/config'
import ConfirmationService from 'primevue/confirmationservice'
import DialogService from 'primevue/dialogservice'
import ToastService from 'primevue/toastservice'
import { createApp } from 'vue'

import 'vue-waterfall-plugin-next/dist/style.css'
import 'primeicons/primeicons.css'

LogHelper.debug('============================')
LogHelper.debug('应用初始化中...')

async function initApp() {
    await PathHelper.init()
    await TransHelper.init()

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
    import('@renderer/style/font.scss')
    import('@renderer/style/main.scss')
    import('@renderer/style/primeVue.scss')

    app.mount('#app')

    // 刮削器初始化
    const settings = settingsStore()
    Scraper.instances.forEach((scraper) => {
        LogHelper.success(`刮削器已加载：${scraper.scraperName}`)
        // 初始化刮削器路径缺省值为output
        settings.scraperPath[scraper.scraperName] =
            settings.scraperPath[scraper.scraperName] || '/output'
    })

    // 初始化当前刮削器缺省值为第一个刮削器
    settings.currentScraper = settings.currentScraper || Scraper.instances[0].scraperName

    // 加载所有可用超分模型到全局状态并打印
    const globalStates = globalStatesStore()
    await globalStates.modelNamesLoaded
    const modelNames = globalStates.modelNames.map((model) => model.name)
    LogHelper.debug(`可用超分模型（${modelNames.length}）：${modelNames.join(', ')}`)

    LogHelper.success('应用初始化完成')

    // 预扫描所有刮削器路径，以加快第一次扫描速度
    preScan()
}

initApp()
