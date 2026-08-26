/* eslint-disable unicorn/number-literal-case */
import type {
    InferenceSession as InferenceSessionType,
    Tensor as TensorType
} from 'onnxruntime-node'
import type { Sharp } from 'sharp'

import { Buffer } from 'node:buffer'
import { stat } from 'node:fs/promises'

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

type OnnxRuntime = typeof import('onnxruntime-node')
let runtimePromise: Promise<OnnxRuntime> | undefined

/**
 * 懒加载 onnxruntime-node 运行时（进程内只加载一次）
 * @remark 必须在 onnxruntime-common 首次加载前禁用全局 Float16Array：common 在模块加载时检测到
 *         Float16Array 可用（现代 Node/Electron 均可用）会把 float16 映射为 Float16Array，但 N-API
 *         无法识别 Float16Array（上报为类型 0），被原生层拒绝（上游 issue #26791）。禁用后 common
 *         走官方兜底的 Uint16Array 存储，与原生层的 float16 约定一致。若将来 onnxruntime 原生支持
 *         Float16Array，移除该行即可。
 */
const loadOnnxRuntime = (): Promise<OnnxRuntime> => {
    runtimePromise ??= (async () => {
        Reflect.deleteProperty(globalThis, 'Float16Array')
        return import('onnxruntime-node')
    })()
    return runtimePromise
}

/**
 * 以指定执行提供程序创建推理会话，GPU 提供程序后附带 cpu 作为不支持算子的回退
 */
const createSession = async (modelPath: string, providers: OnnxProvider[]) => {
    const { InferenceSession } = await loadOnnxRuntime()
    return InferenceSession.create(modelPath, {
        executionProviders: providers,
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
 * float32 转 IEEE754 半精度（float16）位模式，用于没有原生 Float16Array 的旧运行时
 */
const float32ToFloat16Bits = (value: number): number => {
    const view = new DataView(new ArrayBuffer(4))
    view.setFloat32(0, value)
    const x = view.getInt32(0)

    let bits = (x >> 16) & 0x8000
    let mantissa = (x >> 12) & 0x07ff
    const exponent = (x >> 23) & 0xff

    // 指数过小舍入为零，NaN/Infinity 饱和，次正规数收窄
    if (exponent < 103) return bits
    if (exponent > 142) {
        bits |= 0x7c00
        bits |= exponent === 255 ? 0 : 1
        return bits
    }
    if (exponent < 113) {
        mantissa |= 0x0800
        bits |= (mantissa >> (114 - exponent)) + ((mantissa >> (113 - exponent)) & 1)
        return bits
    }

    bits |= ((exponent - 112) << 10) | (mantissa >> 1)
    bits += mantissa & 1
    return bits
}

/**
 * 把 float32 数据转换为 float16 张量的存储数据
 * @remark 必须以 Uint16Array 位模式构造：运行时加载时禁用了全局 Float16Array，
 *         onnxruntime-common 的 float16 存储固定回退到 Uint16Array，这里保持一致
 */
const createFloat16Data = (data: Float32Array): Uint16Array => {
    const halfData = new Uint16Array(data.length)
    for (let i = 0; i < data.length; i++) {
        halfData[i] = float32ToFloat16Bits(data[i] ?? 0)
    }
    return halfData
}

/**
 * 按模型输入声明的数据类型创建输入张量
 * 声明为 float16 的输入会自动把 float32 数据转换为半精度，其余情况直接创建 float32 张量
 */
export async function createInputTensor(
    model: OnnxModel,
    inputName: string,
    data: Float32Array,
    dims: readonly number[]
): Promise<TensorType> {
    const { Tensor } = await loadOnnxRuntime()
    const metadata = model.session.inputMetadata.find((item) => item.name === inputName)

    if (metadata?.isTensor && metadata.type === 'float16') {
        return new Tensor('float16', createFloat16Data(data), [...dims])
    }

    return new Tensor('float32', data, [...dims])
}

/**
 * 半精度位模式转回 float32 值
 */
const float16BitsToFloat32 = (bits: number): number => {
    const sign = (bits & 0x8000) >>> 15
    const exponent = (bits & 0x7c00) >>> 10
    const mantissa = bits & 0x03ff

    let value: number
    if (exponent === 0) {
        value = mantissa * 2 ** -24 // 次正规数与零
    } else if (exponent === 0x1f) {
        value = mantissa === 0 ? Number.POSITIVE_INFINITY : Number.NaN
    } else {
        value = (mantissa / 1024 + 1) * 2 ** (exponent - 15)
    }
    return sign === 0 ? value : -value
}

/**
 * 把模型输出张量读取为 float32 数组
 * float16 输出会自动转回 float32，方便后续图像处理
 */
export function tensorToFloat32(tensor: TensorType): Float32Array {
    if (tensor.type === 'float32') return tensor.data as Float32Array

    if (tensor.type === 'float16') {
        const source = tensor.data as unknown
        const result = new Float32Array(tensor.data.length)

        if (typeof Float16Array === 'function' && source instanceof Float16Array) {
            result.set(source)
            return result
        }
        if (source instanceof Uint16Array) {
            for (let i = 0; i < source.length; i++) {
                result[i] = float16BitsToFloat32(source[i] ?? 0)
            }
            return result
        }
    }

    throw new Error(`无法读取张量为 float32：${tensor.type}`)
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

/**
 * 用 ONNX 模型对图片做 2x 超分
 * @param model 已加载的模型
 * @param inputImage sharp 图像管道（尚未开始输出）
 * @returns 超分后的交错 RGB Buffer 与尺寸
 * @remark 奇数边会裁掉 1px 再超分；输入按 [0,1] 归一化、ALIGN=8 边缘补边，
 *         输出按实际放大比例裁回补边部分
 */
export async function upscaleImage(
    model: OnnxModel,
    inputImage: Sharp
): Promise<{ data: Buffer; width: number; height: number }> {
    const { width: rawWidth, height: rawHeight } = await inputImage.metadata()
    const width = rawWidth ?? 0
    const height = rawHeight ?? 0

    // 奇数边裁掉 1px（右/下边），避免模型内部 Reshape 报错
    const image =
        width % 2 === 1 || height % 2 === 1
            ? inputImage.extract({
                  left: 0,
                  top: 0,
                  width: width - (width % 2),
                  height: height - (height % 2)
              })
            : inputImage

    // 转 RGB，归一化到 [0, 1]，NCHW 排布
    const { data, info } = await image
        .removeAlpha()
        .toColourspace('srgb')
        .raw()
        .toBuffer({ resolveWithObject: true })
    const srcW = info.width
    const srcH = info.height
    const n = srcW * srcH
    const inputData = new Float32Array(n * 3)
    for (let c = 0; c < 3; c++) {
        for (let i = 0; i < n; i++) {
            inputData[c * n + i] = (data[i * 3 + c] ?? 0) / 255
        }
    }

    // 补边到 ALIGN 倍数（边缘像素复制），推理后按实际放大比例裁回
    const align = 8
    const padH = srcH + (-srcH % align)
    const padW = srcW + (-srcW % align)
    let padded = inputData
    if (padH !== srcH || padW !== srcW) {
        padded = new Float32Array(padH * padW * 3)
        for (let c = 0; c < 3; c++) {
            const dstOffset = c * padH * padW
            const srcOffset = c * srcH * srcW
            for (let i = 0; i < padH; i++) {
                const si = Math.min(i, srcH - 1)
                for (let j = 0; j < padW; j++) {
                    padded[dstOffset + i * padW + j] =
                        inputData[srcOffset + si * srcW + Math.min(j, srcW - 1)] ?? 0
                }
            }
        }
    }

    const inputMeta = model.session.inputMetadata[0]
    if (!inputMeta?.isTensor) throw new Error(`模型 ${model.path} 没有有效的输入张量`)
    // 动态维度(如 [1,3,"s53","s0"])替换为实际尺寸;shape 类型声明为 number,运行时可能是符号字符串
    const dims = inputMeta.shape.map((d, idx) => {
        if (typeof d === 'number' && d > 0) return d
        if (idx === 2) return padH
        if (idx === 3) return padW
        return 1
    })

    const tensor = await createInputTensor(model, inputMeta.name, padded, dims)
    const result = await runOnnxModel(model, { [inputMeta.name]: tensor })

    const outputMeta = model.session.outputMetadata[0]
    if (!outputMeta?.isTensor) throw new Error(`模型 ${model.path} 没有有效的输出张量`)
    const outTensor = result[outputMeta.name]
    if (!outTensor) throw new Error(`模型 ${model.path} 推理结果缺少输出: ${outputMeta.name}`)
    const outFloat = tensorToFloat32(outTensor)
    const outH = outTensor.dims[2] ?? 0
    const outW = outTensor.dims[3] ?? 0
    const cropH = Math.round(srcH * (outH / padH))
    const cropW = Math.round(srcW * (outW / padW))

    // NCHW → 交错 RGB
    const outRaw = Buffer.alloc(cropH * cropW * 3)
    for (let c = 0; c < 3; c++) {
        for (let i = 0; i < cropH; i++) {
            for (let j = 0; j < cropW; j++) {
                const value = outFloat[c * outH * outW + i * outW + j] ?? 0
                outRaw[(i * cropW + j) * 3 + c] = Math.max(
                    0,
                    Math.min(255, Math.round(value * 255))
                )
            }
        }
    }

    return { data: outRaw, width: cropW, height: cropH }
}
