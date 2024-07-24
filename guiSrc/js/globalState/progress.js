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
    }
})