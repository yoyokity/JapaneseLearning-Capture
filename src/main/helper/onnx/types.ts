import type { InferenceSession as InferenceSessionType } from 'onnxruntime-node'

/**
 * ONNX 执行提供程序
 * dml/coreml/cuda 为 GPU 加速，cpu 为 CPU 回退
 */
export type OnnxProvider = 'dml' | 'coreml' | 'cuda' | 'cpu'

/**
 * 已加载的 ONNX 模型
 */
export interface OnnxModel {
    path: string
    session: InferenceSessionType
    /**
     * 实际生效的执行提供程序，cpu 表示 GPU 不可用已回退
     */
    provider: OnnxProvider
    inputNames: readonly string[]
    outputNames: readonly string[]
}
