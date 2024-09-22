import { defineStore } from 'pinia'

export const Scraper = defineStore('scraper', {
    state: () => ({
        currentScraper: '',
        ScraperList: []
    }),
    getters: {
        getCurrentScraperOutputPath: (state) =>
            state.ScraperList.find((item) => item.label === state.currentScraper).output
    },
    actions: {
        load () {
            let cache = {}
            this.ScraperList.forEach((value, index) => {
                cache[value.label] = value.output
            })

            let handle = wsClient.invoke('getScrapers', null)
            handle.onEnd((message) => {
                /** @type {string[]} */
                let plugins = message.data

                //添加
                plugins.forEach((plugin, index) => {
                    if (!cache[plugin]) {
                        cache[plugin] = `${plugin}_output`
                    }
                })

                //更新
                this.ScraperList = []
                for (let key in cache) {
                    if (plugins.includes(key)) {
                        this.ScraperList.push({
                            value: key,
                            label: key,
                            output: cache[key]
                        })
                    }
                }

                if (!this.currentScraper) {
                    this.currentScraper = this.ScraperList[0].value
                }
            })
        }
    },
    persist: true
})