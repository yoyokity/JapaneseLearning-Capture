import type { Path } from '@renderer/helper'

import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * 工具唤起请求：其他视图送来的待处理文件路径
 */
interface IPendingRequest {
    path: string
}

export const toolsStore = defineStore(
    'tools',
    () => {
        /** 当前激活的工具ID */
        const activeToolId = ref('imageSuperResolution')
        /** 图片超分当前选中的模型名 */
        const superResolutionModelName = ref('')

        /**
         * 待处理的音频编码请求（被工具消费后置空）
         * @remark 会话性临时状态，不做持久化
         */
        const pendingAudioEncode = ref<IPendingRequest | null>(null)

        /**
         * 待处理的图片超分请求（被工具消费后置空）
         * @remark 会话性临时状态，不做持久化
         */
        const pendingSuperResolution = ref<IPendingRequest | null>(null)

        /**
         * 工具唤起请求计数：每次 openInXxx 递增，
         * 用于通知外部（如 tabContainer）有新请求进入，无需逐个监听 pending 字段
         */
        const pendingRequestCount = ref(0)

        /**
         * 用音频编码工具打开指定视频文件，并切换到对应工具
         * @param path 视频文件路径
         */
        function openInAudioEncode(path: Path | string) {
            activeToolId.value = 'audioEncode'
            pendingAudioEncode.value = { path: path.toString() }
            pendingRequestCount.value++
        }

        /**
         * 用图片超分工具打开指定图片文件，并切换到对应工具
         * @param path 图片文件路径
         */
        function openInImageSuperResolution(path: Path | string) {
            activeToolId.value = 'imageSuperResolution'
            pendingSuperResolution.value = { path: path.toString() }
            pendingRequestCount.value++
        }

        return {
            /**
             * 当前激活的工具ID
             */
            activeToolId,
            /**
             * 图片超分当前选中的模型名
             */
            superResolutionModelName,
            /**
             * 待处理的音频编码请求（被工具消费后置空）
             */
            pendingAudioEncode,
            /**
             * 待处理的图片超分请求（被工具消费后置空）
             */
            pendingSuperResolution,
            /**
             * 工具唤起请求计数：每次 openInXxx 递增，通知外部有新请求进入
             */
            pendingRequestCount,
            /**
             * 用音频编码工具打开指定视频文件，并切换到对应工具
             * @param path 视频文件路径
             */
            openInAudioEncode,
            /**
             * 用图片超分工具打开指定图片文件，并切换到对应工具
             * @param path 图片文件路径
             */
            openInImageSuperResolution
        }
    },
    {
        persist: {
            pick: ['superResolutionModelName']
        }
    }
)
