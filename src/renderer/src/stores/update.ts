import type { IUpdateInfo, IUpdateState } from '@shared'

import { LogHelper } from '@renderer/helper'
import { ipc } from '@renderer/ipc'
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const updateStore = defineStore('update', () => {
    /** 检查到的新版本信息，null 表示没有更新 */
    const info = ref<IUpdateInfo | null>(null)
    /** 是否正在检查更新 */
    const checking = ref(false)
    /** 下载/安装状态 */
    const state = ref<IUpdateState>({
        status: 'idle',
        stage: null,
        received: 0,
        total: 0,
        targetVersion: null,
        error: null
    })

    /** 是否已建立进度订阅 */
    let watching = false

    /**
     * 订阅更新进度（订阅时会先收到一次当前状态）
     */
    function watchProgress() {
        if (watching) return
        watching = true

        ipc.update.progress.subscribe(undefined, {
            onData(next) {
                state.value = next
            },
            onError(error) {
                LogHelper.error('更新进度订阅失败', error)
            }
        })
    }

    // 启动即订阅，恢复上次下载完成但未应用的状态
    watchProgress()

    /**
     * 检查更新
     * @returns 新版本信息，null 表示已是最新版本
     */
    async function check() {
        if (checking.value) return info.value

        checking.value = true
        try {
            info.value = await ipc.update.check.mutate()
            return info.value
        } finally {
            checking.value = false
        }
    }

    /**
     * 下载更新包，下载与解压在主进程后台进行
     */
    async function download() {
        if (!info.value) return

        await ipc.update.startDownload.mutate({ version: info.value.version })
    }

    /**
     * 重启并应用更新
     */
    async function apply() {
        await ipc.update.apply.mutate()
    }

    return {
        /**
         * 检查到的新版本信息，null 表示没有更新
         */
        info,
        /**
         * 是否正在检查更新
         */
        checking,
        /**
         * 下载/安装状态
         */
        state,
        /**
         * 检查更新
         */
        check,
        /**
         * 下载更新包
         */
        download,
        /**
         * 重启并应用更新
         */
        apply
    }
})
