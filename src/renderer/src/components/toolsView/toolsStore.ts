import type { Path } from '@renderer/helper'

import { defineStore } from 'pinia'
import { ref } from 'vue'

interface IPendingAudioEncode {
    path: string
}

export const toolsStore = defineStore('tools', () => {
    /** 当前激活的工具ID */
    const activeToolId = ref('audioEncode')

    /**
     * 其他视图送来的音频编码请求，被工具消费后置空
     * @remark 会话性临时状态，不做持久化
     */
    const pendingAudioEncode = ref<IPendingAudioEncode | null>(null)

    /**
     * 用音频编码工具打开指定视频文件，并切换到对应工具
     * @param path 视频文件路径
     */
    function openInAudioEncode(path: Path | string) {
        activeToolId.value = 'audioEncode'
        pendingAudioEncode.value = { path: path.toString() }
    }

    return {
        /**
         * 当前激活的工具ID
         */
        activeToolId,
        /**
         * 待处理的音频编码请求
         */
        pendingAudioEncode,
        openInAudioEncode
    }
})
