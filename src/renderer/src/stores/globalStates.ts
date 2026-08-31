import type { SuperResolutionModel } from '@shared'

import { LogHelper } from '@renderer/helper'
import { ipc } from '@renderer/ipc'
import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * 内置超分模型（硬编码，name 供展示，path 为 image-polish/models 目录下的 .onnx 文件名）
 * @remark 仅当本地 models 目录中存在对应文件时才展示（path 为空的非AI修复选项始终展示）；未写在此处的模型文件会以文件名（不带后缀）自动补充为模型名，且无说明
 */
const BUILTIN_SUPER_RESOLUTION_MODELS: SuperResolutionModel[] = [
    {
        name: 'RealESRGAN_plus',
        path: 'RealESRGAN_x2plus.onnx',
        description: 'x2 通用写实（真人默认）'
    },
    {
        name: 'GTv6',
        path: '2xGTv6-cel_dynamic.onnx',
        description: 'x2 高保真动漫风格（动漫默认）'
    },
    {
        name: 'HSRv3',
        path: '2x_HSR_V3_compact_fp16_op18.onnx',
        description: 'x2 动漫强修复，会有明显涂抹效果，仅适用于瑕疵明显的图片'
    },
    {
        name: '非ai修复',
        path: '',
        description: 'x1 纯图片瑕疵修复'
    }
]

export const globalStatesStore = defineStore('globalStates', () => {
    /**
     * 图片缓存版本
     * @description 用于刷新同路径图片的显示缓存
     */
    const imageCacheVersion = ref(Date.now())
    /**
     * 刷新图片缓存版本
     */
    function refreshImageCacheVersion() {
        imageCacheVersion.value = Date.now()
    }

    /**
     * 已刮削数量
     */
    const batchScrapedCount = ref(0)

    /**
     * 批量刮削总数
     */
    const batchTotalCount = ref(0)

    /**
     * 批量刮削的运行状态
     */
    const batchRunning = ref(false)

    /**
     * 可用超分模型列表
     */
    const modelNames = ref<SuperResolutionModel[]>([])

    /**
     * 模型列表加载任务（store 首次实例化时自动开始，供启动流程等待加载完成）
     * @description 先检测本地 models 目录，硬编码清单仅保留本地存在的模型；其余本地模型以文件名去后缀为模型名，无说明
     */
    const modelNamesLoaded: Promise<void> = (async () => {
        try {
            const modelFiles = await ipc.media.getSuperResolutionModels.query()
            // 硬编码中本地缺失的模型不展示（path 为空的非AI修复选项始终展示）
            const builtinModels = BUILTIN_SUPER_RESOLUTION_MODELS.filter(
                (model) => !model.path || modelFiles.includes(model.path.replace(/\.onnx$/, ''))
            )
            // 本地存在但未硬编码的模型，按文件名去后缀作为模型名与 path
            const extraModels = modelFiles
                .filter(
                    (file) =>
                        !builtinModels.some((model) => model.path.replace(/\.onnx$/, '') === file)
                )
                .map((file) => ({ name: file, path: `${file}.onnx`, description: '' }))
            modelNames.value = [...builtinModels, ...extraModels]
        } catch (error) {
            LogHelper.error('加载可用超分模型失败', error)
        }
    })()

    return {
        /**
         * 可用超分模型列表
         */
        modelNames,
        /**
         * 模型列表加载任务
         */
        modelNamesLoaded,

        /**
         * 已刮削数量
         */
        batchScrapedCount,
        /**
         * 批量刮削总数
         */
        batchTotalCount,
        /**
         * 批量刮削的运行状态
         */
        batchRunning,

        /**
         * 是否正在进行文件扫描
         */
        scanFilesLoading: ref(false),
        /**
         * 图片缓存版本
         * @description 用于刷新同路径图片的显示缓存
         */
        imageCacheVersion,
        /**
         * 刷新图片缓存版本
         */
        refreshImageCacheVersion
    }
})
