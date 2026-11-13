import type { IDependencyInfo, IDependencyState } from '@shared'

import { LogHelper } from '@renderer/helper'
import { ipc } from '@renderer/ipc'
import { defineStore } from 'pinia'
import { ref } from 'vue'

import { globalStatesStore } from './globalStates'

export const dependencyStore = defineStore('dependency', () => {
    /** 依赖列表 */
    const items = ref<IDependencyInfo[]>([])
    /** 远端信息是否可用 */
    const remoteOk = ref(true)
    /** 必需依赖是否缺失 */
    const missingRequired = ref(false)
    /** 是否正在检查 */
    const checking = ref(false)
    /** 是否可下载 */
    const canInstall = ref(true)
    /** 安装状态 */
    const state = ref<IDependencyState>({
        id: null,
        status: 'idle',
        received: 0,
        total: 0,
        error: null
    })

    /** 是否已订阅 */
    let watching = false

    /**
     * 订阅安装进度
     */
    function watchProgress() {
        if (watching) return
        watching = true

        ipc.dependency.progress.subscribe(undefined, {
            onData(next) {
                const installed = next.status === 'done' && state.value.status !== 'done'
                state.value = next
                // 安装完成刷新模型与依赖状态
                if (installed) {
                    void checkLocal()
                    void globalStatesStore().reloadModelNames()
                }
            },
            onError(error) {
                LogHelper.error('依赖进度订阅失败', error)
            }
        })
    }

    // 启动即订阅
    watchProgress()

    void ipc.app.isPackaged.query().then((value) => {
        canInstall.value = value
    })

    /**
     * 检查本地依赖
     */
    async function checkLocal() {
        try {
            const list = await ipc.dependency.local.query()
            missingRequired.value = list.some((item) => item.required && !item.installed)
        } catch (error) {
            LogHelper.error('检查本地依赖失败', error)
        }
    }

    /**
     * 检查依赖状态
     * @returns 依赖列表
     */
    async function refresh() {
        checking.value = true
        try {
            const result = await ipc.dependency.list.query()
            items.value = result.items
            remoteOk.value = result.remoteOk
            missingRequired.value = result.items.some((item) => item.required && !item.installed)
            return items.value
        } finally {
            checking.value = false
        }
    }

    /**
     * 安装依赖
     * @param id 依赖 id
     */
    async function install(id: string) {
        await ipc.dependency.install.mutate({ id })
    }

    return {
        /**
         * 依赖列表
         */
        items,
        /**
         * 远端信息是否可用
         */
        remoteOk,
        /**
         * 必需依赖是否缺失
         */
        missingRequired,
        /**
         * 是否正在检查
         */
        checking,
        /**
         * 是否可下载
         */
        canInstall,
        /**
         * 安装状态
         */
        state,
        /**
         * 检查依赖状态
         */
        refresh,
        /**
         * 检查本地依赖
         */
        checkLocal,
        /**
         * 安装依赖
         */
        install
    }
})
