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
            let handle = wsClient.invoke('getScrapers', null)
            handle.onEnd((message) => {
                let plugins = message.data
                this.ScraperList = plugins.map((item, index) => ({
                    value: item,
                    label: item,
                    output: this.ScraperList.length === 0 ? `${item}_output` : this.ScraperList[index].output
                }))
                if (!this.currentScraper) {
                    this.currentScraper = this.ScraperList[0].value
                }
            })
        }
    },
    persist: true
})