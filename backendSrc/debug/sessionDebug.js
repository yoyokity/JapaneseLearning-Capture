////////////////////
//修改参数
let file_path = 'F:\\gogogo\\Anime\\[encoded][KyokuSai] 妻ネトリ 零 -僕の過ち 彼女の選択- [1080P][WEBRip][HEVC 10bit]_1_prob4.mkv'
let jav_num = '妻ネトリ 零'
let scraper_name = 'DLsite'
let outputPath = 'F:\\gogogo\\Anime\\新建文件夹'
/////////////////////////////

//代理和翻译
import Session from '../scraper/tool/session.js'
import translate from '../scraper/tool/translator.js'

Session.proxy = {
    'host': '127.0.0.1',
    'port': '7890'
}
translate.translateOn = true

import { Scraper } from '../scraper/Scraper.js'
import { Helper } from '../../yo-electron-lib/Helper/helper.js'
import { fileURLToPath } from 'url'
import { join, dirname } from 'path'
import Video from '../scraper/Video.js'

//运行
const __dirname = dirname(fileURLToPath(import.meta.url))
Helper.init(join(__dirname, '../../'), join(__dirname, '../../'))
await Scraper.load()

//检测翻译
let re = await translate.checkConnect()
if (re === true) {
    //检测网络
    let scraper = new Scraper.subclasses[scraper_name](new Video(''))
    let re = await scraper.checkConnect()
    if (re === true) {
        const video = new Video(jav_num)
        video.scraperName = scraper_name
        scraper = new Scraper.subclasses[scraper_name](video)

        const cilent = {
            respond(){}
        }
        await scraper.run(outputPath, video.title, file_path,cilent)
    } else {
        console.log(`无法连接到${re}站点`)
    }
} else {
    console.log(`无法连接到${re}站点`)
}

console.log(1)