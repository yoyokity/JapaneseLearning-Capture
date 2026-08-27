/* eslint-disable unicorn/number-literal-case */
import type { Tensor as TensorType } from 'onnxruntime-node'
import type { OnnxModel } from './types'

import { loadOnnxRuntime } from './runtime'

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
