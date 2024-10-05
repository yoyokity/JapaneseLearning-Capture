import { defineStore } from 'pinia'

let _closeWithFunc = null

export const ContextMenu = defineStore('contextMenu', {
    state: () => ({
        show: false,
        contextConfig: [],
        x: 0,
        y: 0,
    }),
    getters: {
        getShow: (state) => state.show,
        pos_x: (state) => state.x,
        pos_y: (state) => state.y
    },
    actions: {
        /**
         * 显示右键菜单
         * @param {{ [label: string]: () => void }} config 每个字段key为菜单item，func为点击后执行的函数
         * @param {number} pos_x 出现的位置x
         * @param {number} pos_y 出现的位置y
         * @param {() => void} openWithFunc 打开菜单时执行的函数
         * @param {() => void} closeWithFunc 关闭菜单时执行的函数
         */
        showMenu (config, pos_x, pos_y, openWithFunc = null, closeWithFunc = null) {
            this.contextConfig = config
            this.x = pos_x
            this.y = pos_y
            this.show = true
            setTimeout(()=>document.getElementById('context-menu').focus(),50)

            _closeWithFunc = closeWithFunc
            if (openWithFunc) {
                openWithFunc()
            }
        },
        closeMenu () {
            this.show = false
            if (_closeWithFunc) {
                _closeWithFunc()
            }
        }
    }
})