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

////////////////////
//修改参数
let file_path = 'D:\\W2xExTmp\\新建文件夹\\性欲つよつよ 第1巻.mkv'
let jav_num = '1283624'
let scraper_name = 'getchu'
let outputPath = 'D:\\W2xExTmp\\新建文件夹'
/////////////////////////////

//运行
const __dirname = dirname(fileURLToPath(import.meta.url))
Helper.init(join(__dirname, '../../'), join(__dirname, '../../'))
await Scraper.load()

const video = new Video(jav_num)
video.scraperName = scraper_name
const scraper = new Scraper.subclasses[scraper_name](video)

const cilent = {
    respond(){}
}
await scraper.run(outputPath, video.title, file_path,cilent)

console.log(1)