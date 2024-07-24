import { defineStore } from 'pinia'

export const Settings = defineStore('settings', {
    state: () => ({
        connection_timeout: 15,
        connection_retry: 3,
        connection_delay: 3,
        proxy: false,
        proxy_ip: '127.0.0.1',
        proxy_port: '7890',
        trans: false,
        trans_engine: 'google',
        trans_language: '简体中文',
        trans_baidu_id: '',
        trans_baidu_key: '',
        trans_tencent_id: '',
        trans_tencent_key: '',
    }),
    getters: {
        getTransEngineList: () => ['google', '百度翻译', '腾讯翻译'],
        getTransLangList: () => ['简体中文', '繁体中文'],
        getTransEngine: (state) => {
            switch (state.trans_engine) {
                case '百度翻译':
                    return 'baidu'
                case '腾讯翻译':
                    return 'tencent'
                default:
                    return 'google'
            }
        },
        getTransLanguage: (state) => {
            switch (state.trans_language) {
                case '繁体中文':
                    return 'cht'
                case '简体中文':
                    return 'zh'
                default:
                    return 'zh'
            }
        }
    },
    actions: {
        sendWS () {
            wsClient.send('set-setting', {
                timeout: this.connection_timeout * 1000,
                retry: this.connection_retry,
                delay: this.connection_delay * 1000,
                proxy: this.proxy ? {
                    host: this.proxy_ip,
                    port: this.proxy_port
                } : null,
                translateOn: this.trans,
                translateEngine: this.getTransEngine,
                translateTarget: this.getTransLanguage,
                baiduApi: {
                    id: this.trans_baidu_id,
                    key: this.trans_baidu_key
                },
                tencentApi: {
                    id: this.trans_tencent_id,
                    key: this.trans_tencent_key
                }
            })
        }
    },
    persist: true
})



