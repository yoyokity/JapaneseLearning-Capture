import type { InferenceSession as InferenceSessionType } from 'onnxruntime-node'
import type { OnnxModel, OnnxProvider } from './types'

import { stat } from 'node:fs/promises'

import { loadOnnxRuntime } from './runtime'

/**
 * 各平台优先使用的 GPU 执行提供程序：
 * Windows 使用 DirectML（onnxruntime-node 内置，支持 NVIDIA/AMD/Intel 显卡）
 * macOS 使用 CoreML；Linux 的 CUDA 二进制未内置，缺失时会抛错并回退到 CPU
 */
const platformGpuProvider: Partial<Record<NodeJS.Platform, OnnxProvider>> = {
    win32: 'dml',
    darwin: 'coreml',
    linux: 'cuda'
}

/**
 * 已加载的模型缓存，同一模型路径只解析一次
 */
const modelCache = new Map<string, Promise<OnnxModel>>()

/**
 * 以指定执行提供程序创建推理会话，GPU 提供程序后附带 cpu 作为不支持算子的回退
 */
const createSession = async (modelPath: string, providers: OnnxProvider[]) => {
    const { InferenceSession } = await loadOnnxRuntime()
    return InferenceSession.create(modelPath, {
        executionProviders: providers,
        // 关闭 CPU 内存 arena：推理分配的内存即时归还系统，避免任务后 RSS 维持峰值（换取少量推理性能）
        enableCpuMemArena: false,
        // 只记录错误级别日志，避免 GPU 初始化的警告刷屏
        logSeverityLevel: 3
    })
}

/**
 * 创建模型会话：模型文件必须存在；优先 GPU，失败自动回退 CPU
 */
const createModel = async (modelPath: string): Promise<OnnxModel> => {
    try {
        await stat(modelPath)
    } catch {
        throw new Error(`ONNX 模型不存在：${modelPath}`)
    }

    const gpuProvider = platformGpuProvider[process.platform]
    let session: InferenceSessionType | undefined
    let provider: OnnxProvider = 'cpu'

    if (gpuProvider) {
        try {
            session = await createSession(modelPath, [gpuProvider, 'cpu'])
            provider = gpuProvider
        } catch (error) {
            console.warn(`[onnx] GPU(${gpuProvider}) 初始化失败，回退到 CPU：`, error)
        }
    }

    session ??= await createSession(modelPath, ['cpu'])

    return {
        path: modelPath,
        session,
        provider,
        inputNames: session.inputNames,
        outputNames: session.outputNames
    }
}

/**
 * 加载 ONNX 模型：优先使用当前平台的 GPU 加速，加载失败自动回退到 CPU
 * @param modelPath .onnx 模型文件路径
 * @remark 同一路径的模型会被缓存复用，如需强制重新加载请先调用 disposeOnnxModel
 */
export function loadOnnxModel(modelPath: string): Promise<OnnxModel> {
    const cached = modelCache.get(modelPath)
    if (cached) return cached

    const promise = createModel(modelPath)
    modelCache.set(modelPath, promise)
    // 加载失败的缓存不保留，允许下次重试
    promise.catch(() => modelCache.delete(modelPath))
    return promise
}

/**
 * 运行一次 ONNX 推理
 * @param model loadOnnxModel 返回的模型
 * @param feeds 输入张量映射，键为输入名（可用 model.inputNames 查询）
 * @remark GPU 上运行失败时（如个别算子不受支持）会自动释放当前会话并改用 CPU 重试一次，
 *         之后传入的同一 model 对象也会一直使用 CPU 会话
 */
export async function runOnnxModel(
    model: OnnxModel,
    feeds: InferenceSessionType.OnnxValueMapType
): Promise<InferenceSessionType.OnnxValueMapType> {
    try {
        return await model.session.run(feeds)
    } catch (error) {
        if (model.provider === 'cpu') throw error

        console.warn(`[onnx] GPU(${model.provider}) 推理失败，改用 CPU 重试：`, error)
        await disposeOnnxModel(model.path)
        const fallback = await loadOnnxModel(model.path)
        Object.assign(model, fallback)
        return fallback.session.run(feeds)
    }
}

/**
 * 释放缓存的模型会话
 * @param modelPath 只释放指定模型；不传则释放全部
 */
export async function disposeOnnxModel(modelPath?: string) {
    const paths = modelPath ? [modelPath] : [...modelCache.keys()]

    for (const path of paths) {
        const pending = modelCache.get(path)
        modelCache.delete(path)
        if (!pending) continue

        try {
            const model = await pending
            await model.session.release()
        } catch {
            // 会话尚未加载完成或已释放，无需处理
        }
    }
}
