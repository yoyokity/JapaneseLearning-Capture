import { promises as fs } from 'fs'
import { shell } from 'electron'

import { dialog } from 'electron/main'

import WsServer from '../yo-electron-lib/webSocket/server.js'
import { Helper } from '../yo-electron-lib/Helper/helper.js'
import Session from './scraper/tool/session.js'
import translator from './scraper/tool/translator.js'
import { Scraper, scraping } from './scraper/Scraper.js'
import Video from './scraper/Video.js'
import translate from './scraper/tool/translator.js'

export const wsServer = new WsServer()

//程序关闭相关
wsServer.onSend('appControl', (message) => {
    let action = message.data
    let window = message.from
    switch (action) {
        case 'close':
            yoyoNode.app.quit()
            break
        case 'min':
            yoyoNode.window[window].minimize()
            break
        case 'max':
            if (yoyoNode.window[window].isMaximized()) {
                yoyoNode.window[window].unmaximize()
            } else {
                yoyoNode.window[window].maximize()
            }
            break
    }
})

//设置相关
wsServer.onSend('set-setting', (message) => {
    let data = message.data
    Session.timeout = data.timeout
    Session.retry = data.retry
    Session.delay = data.delay
    Session.proxy = data.proxy
    translator.translateOn = data.translateOn
    translator.translateEngine = data.translateEngine
    translator.translateTarget = data.translateTarget
    translator.baiduApi = data.baiduApi
    translator.tencentApi = data.tencentApi
})

//打开文件选择对话框
wsServer.onInvoke('showOpenDialog', async (message, client) => {
    let data = message.data
    const { canceled, filePaths } = await dialog.showOpenDialog(yoyoNode.window.mainWindow, data)
    if (!canceled) {
        getFileSizes(filePaths).then(fileSizes => {
            client.respond(fileSizes)
        })
    }
})

//浏览器打开链接
wsServer.onSend('openLink', (message) => { shell.openExternal(message.data) })

//测试翻译
wsServer.onInvoke('checkTrans', async (message, client) => {
    let res = await translator.translate('you')
    client.end(res !== null)
})

async function getFileSizes (filePaths) {
    const fileSizePromises = filePaths.map(async (filePath) => {
        try {
            const stats = await fs.stat(filePath)
            let file = Helper.path.new(filePath)
            return {
                name: file.fileName,
                basename: file.basename,
                path: file.str,
                size: stats.size
            }
        } catch (error) {
            console.error(`Error getting size for file: ${filePath}`, error)
            return { path: filePath, size: null }
        }
    })

    return await Promise.all(fileSizePromises)
}

//获取所有刮削器
wsServer.onInvoke('getScrapers', async (message, client) => {
    let res = Object.keys(Scraper.subclasses)
    client.end(res)
})

//检测网络连接性
wsServer.onInvoke('checkNetwork', async (message, client) => {
    let scraperType = message.data.type
    let re = await translate.checkConnect()
    if (re === true) {
        let video = new Video('')
        /** @type {Scraper} */
        const scraper = new Scraper.subclasses[scraperType](video)
        let re = await scraper.checkConnect()
        client.end(re)
    }else {
        client.end(re)
    }
})

//开始刮削
wsServer.onInvoke('beginScrap', async (message, client) => {
    scraping.value = true
    let scraperType = message.data.type
    let files = message.data.files
    let outputPath = message.data.outputPath

    if (!Helper.path.isAbsolute(outputPath)) {
        outputPath = Helper.path.appDir.join(outputPath).str
    }

    for (const file of files) {
        const video = new Video(file.jav)
        video.scraperName = scraperType
        /** @type {Scraper} */
        const scraper = new Scraper.subclasses[scraperType](video)
        if (await scraper.run(outputPath, file.longJavNumber, file.path, client)) {
            client.respond({
                filePath: file.path,
                state: true
            })
        } else {
            client.respond({
                filePath: file.path,
                state: false
            })
        }

        if (!scraping.value) {
            client.respond('end')
            return
        }
    }
})

//结束刮削
wsServer.onSend('endScrap', async (message) => {
    scraping.value = false
})
