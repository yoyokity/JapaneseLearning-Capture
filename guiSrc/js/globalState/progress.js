import { defineStore } from 'pinia'

export const Progress = defineStore('progress', {
    state: () => ({
        dialogShow: false,
        current: 0,
        total: 0
    }),
    getters: {
        getPercent: (state) => state.current / state.total * 100
    },
    actions: {
        begin (total) {
            this.dialogShow = true
            this.current = 0
            this.total = total
        },
        update () {
            this.current++
            if (this.current === this.total) {
                this.dialogShow = false
            }
        },
        end () {
            this.dialogShow = false
        }
    }
})

export const SubProgress = defineStore('subProgress', {
    state: () => ({
        current: 0,
        total: 21,
        text: '搜索影片',
        button: '取消',
        buttonDisabled: false
    }),
    getters: {
        getPercent: (state) => state.current / state.total * 100,
        getText: (state) => state.text
    },
    actions: {
        begin () {
            this.current = 0
            this.button = '取消'
            this.buttonDisabled = false
        },
        update (text) {
            this.current++
            this.text = text
            if (this.current > this.total) {
                this.current = this.total
            }
        },
    }
})