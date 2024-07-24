import tencentcloud from 'tencentcloud-sdk-nodejs-tmt'
import md5 from 'md5'
import querystring from 'querystring'
import { URLSearchParams } from 'url'
import { toSimplified, toTraditional } from 'chinese-simple2traditional'
import { setupEnhance } from 'chinese-simple2traditional/enhance'

setupEnhance() // 注入短语库

import Session from './session.js'

const CvmClient = tencentcloud.tmt.v20180321.Client

/** @type {Promise<string|null>} */
async function translateTencent (text, id, key, targetLanguage = 'zh') {
    const client = new CvmClient({
        credential: {
            secretId: id,
            secretKey: key,
        },
        region: 'ap-shanghai',
        profile: {
            signMethod: 'TC3-HMAC-SHA256',
            httpProfile: {
                reqMethod: 'GET',
                reqTimeout: Session.timeout,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
                },
                proxy: Session.proxy ? Session.get_proxy_text() : null
            },
        },
    })

    try {
        let res = await client.TextTranslate({
            Source: 'auto',
            SourceText: text,
            ProjectId: 0,
            Target: targetLanguage
        })
        return res.TargetText
    } catch (e) {
        return null
    }
}

/** @type {Promise<string|null>} */
async function translateBaidu (text, id, key, targetLanguage = 'zh') {
    const appid = id
    const secret = key
    const q = text
    const salt = Math.random()
    const sign = md5(appid + q + salt + secret)
    const params = {
        q,
        from: 'auto',
        to: targetLanguage,
        salt,
        appid,
        sign,
    }

    try {
        const session = new Session('')
        let res = await session.get('https://fanyi-api.baidu.com/api/trans/vip/translate?'
            + querystring.stringify(params))
        return res.data['trans_result'][0]['dst']
    } catch (e) {
        return null
    }
}

/** @type {Promise<string|null>} */
async function translateGoogle (s_text, targetLanguage = 'zh-CN') {
    const url = [
        `https://translate.google.com/translate_a/single`,
        '?client=at',
        '&dt=t',
        '&dt=rm',
        '&dj=1',
    ].join('')
    const headers = {
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
    }
    const form = {
        sl: 'auto',
        tl: targetLanguage,
        q: s_text,
    }

    try {
        const session = new Session('')
        let res = await session.post(url, new URLSearchParams(form).toString(), headers)
        return res.data['sentences'][0].trans
    } catch (e) {
        return null
    }
}

class Translator {
    translateOn = false
    translateEngine = 'google'
    translateTarget = 'zh'
    tencentApi = {
        'id': '',
        'key': ''
    }
    baiduApi = {
        'id': '',
        'key': ''
    }

    /**
     * 翻译
     * @param {string} text 源文
     * @returns {Promise<string|null>} 翻译成功返回文本；翻译失败或未开启翻译则返回null
     */
    translate (text) {
        if (!this.translateOn) return null

        let targetLanguage = this.translateTarget

        // Google
        if (this.translateEngine === 'google') {
            targetLanguage = targetLanguage === 'cht' ? 'zh-TW' : targetLanguage
            targetLanguage = targetLanguage === 'kor' ? 'ko' : targetLanguage
            targetLanguage = targetLanguage === 'fra' ? 'fr' : targetLanguage
            targetLanguage = targetLanguage === 'zh' ? 'zh-CN' : targetLanguage

            return translateGoogle(text, targetLanguage)
        }

        // Baidu
        if (this.translateEngine === 'baidu') {
            const id = this.baiduApi.id
            const key = this.baiduApi.key

            return translateBaidu(text, id, key, targetLanguage)
        }

        // Tencent
        if (this.translateEngine === 'tencent') {
            const id = this.tencentApi.id
            const key = this.tencentApi.key

            targetLanguage = targetLanguage === 'cht' ? 'zh-TW' : targetLanguage
            targetLanguage = targetLanguage === 'kor' ? 'ko' : targetLanguage
            targetLanguage = targetLanguage === 'fra' ? 'fr' : targetLanguage

            return translateTencent(text, id, key, targetLanguage)
        }
    }

    /**
     * 繁体转化为简体
     * @param {string} text
     * @return {string}
     */
    translateSC (text) {
        return toSimplified(text, true)
    }
}

const translator = new Translator()
export default translator
