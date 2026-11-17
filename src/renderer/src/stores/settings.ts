import type { IAiSettings } from '@renderer/helper/AgentHelper/AiConfig.ts'
import type { ITranslateSettings } from '@renderer/helper/TransHelper.ts'

import { NetHelper } from '@renderer/helper'
import { defineStore } from 'pinia'
import { reactive, ref, watch } from 'vue'

export const VideoSortTypeList = {
    title: '标题名称',
    releasedate: '发布日期',
    joinTime: '加入时间',
    changeTime: '编辑时间'
} as const

export type VideoSortType = keyof typeof VideoSortTypeList

/** 默认翻译设置 */
const DEFAULT_TRANSLATE_SETTINGS: ITranslateSettings = {
    enable: false,
    retryWithGoogle: true,
    targetLanguage: 'zh-CN',
    ai: true
}

export const settingsStore = defineStore(
    'settings',
    () => {
        // 代理
        const proxy = reactive({
            enable: true,
            host: '127.0.0.1',
            port: 7890
        })

        // proxy 变化时自动设置
        watch(
            proxy,
            (newValue) => {
                NetHelper.setProxy(newValue.enable, newValue.host, newValue.port.toString())
            },
            {
                /** 初始化时立即执行 */
                immediate: true,
                /** 深度监听 */
                deep: true
            }
        )

        // 网络
        const net = reactive({
            /** 请求超时时间 */
            timeout: 7,
            /** 重试次数 */
            retry: 3,
            /** 相同网站请求间隔 */
            delay: 3000
        })

        // AI 模型
        const ai = reactive<IAiSettings>({
            provider: 'openai',
            openai: {
                apiKey: '',
                model: 'gpt-6.1-sol',
                reasoningEffort: 'high'
            },
            deepseek: {
                apiKey: '',
                model: 'deepseek-flash',
                reasoningEffort: 'max'
            },
            custom: {
                baseUrl: '',
                apiKey: '',
                apiFormat: 'responses',
                model: '',
                reasoningEffort: 'none'
            }
        })

        // 翻译
        const translate = reactive<ITranslateSettings>({ ...DEFAULT_TRANSLATE_SETTINGS })

        const scraperPath = reactive<Record<string, string>>({})
        const currentScraper = ref('')
        const manageViewSort = ref<VideoSortType>('title')
        const manageViewSortReverse = ref(true)
        const manageViewTagsMatchAll = ref(true)

        // 更新
        const update = reactive({
            /** 启动时自动检查更新 */
            autoCheck: true
        })

        return {
            proxy,
            net,
            /** AI 模型配置 */
            ai,
            /** 翻译设置 */
            translate,
            /** 更新设置 */
            update,
            /** 刮削器路径 */
            scraperPath,
            /** 当前刮削器名称 */
            currentScraper,
            /** 管理视图排序 */
            manageViewSort,
            /** 管理视图排序方向 */
            manageViewSortReverse,
            /**
             * 管理视图 tags 匹配模式
             * @description false 时匹配任一 tag
             */
            manageViewTagsMatchAll
        }
    },
    {
        persist: {
            afterHydrate: (context) => {
                // 清理旧版 translate 字段
                const translate = context.store.translate as unknown as Record<string, unknown>
                const validKeys = new Set(Object.keys(DEFAULT_TRANSLATE_SETTINGS))
                let cleaned = false

                for (const key of Object.keys(translate)) {
                    if (validKeys.has(key)) continue

                    delete translate[key]
                    cleaned = true
                }

                if (cleaned) context.store.$persist()
            }
        }
    }
)
