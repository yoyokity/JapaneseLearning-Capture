import type { Sharp } from 'sharp'
import type { OnnxModel } from './types'

import { Buffer } from 'node:buffer'

import { runOnnxModel } from './session'
import { createInputTensor, tensorToFloat32 } from './tensor'

/**
 * 模型输入尺寸对齐的倍数，不足时用边缘像素补边
 */
const ALIGN = 8

/**
 * 任一边超过该尺寸时切块推理，避免整图推理的内存峰值
 */
const TILE_THRESHOLD = 1024
/**
 * 切块边长与重叠像素（重叠用于消除拼接缝）
 */
const TILE_SIZE = 512
const TILE_OVERLAP = 16

/**
 * RGB 交错 Buffer 归一化到 [0, 1] 并转为 NCHW 排布
 */
function toNCHWNormalized(data: Buffer, width: number, height: number): Float32Array {
    const n = width * height
    const result = new Float32Array(n * 3)
    for (let c = 0; c < 3; c++) {
        for (let i = 0; i < n; i++) {
            result[c * n + i] = (data[i * 3 + c] ?? 0) / 255
        }
    }
    return result
}

/**
 * 边缘像素复制补边到 ALIGN 倍数
 * @returns 补边后的 NCHW 数据与尺寸；已是倍数时返回原数据
 */
function padToAlign(
    data: Float32Array,
    width: number,
    height: number
): { data: Float32Array; width: number; height: number } {
    const padW = Math.ceil(width / ALIGN) * ALIGN
    const padH = Math.ceil(height / ALIGN) * ALIGN
    if (padW === width && padH === height) {
        return { data, width, height }
    }

    const padded = new Float32Array(padH * padW * 3)
    for (let c = 0; c < 3; c++) {
        const dstOffset = c * padH * padW
        const srcOffset = c * height * width
        for (let i = 0; i < padH; i++) {
            const si = Math.min(i, height - 1)
            for (let j = 0; j < padW; j++) {
                padded[dstOffset + i * padW + j] =
                    data[srcOffset + si * width + Math.min(j, width - 1)] ?? 0
            }
        }
    }
    return { data: padded, width: padW, height: padH }
}

/**
 * 把 NCHW 浮点输出（[0,1]）转回交错 RGB Buffer（0-255）
 */
function toInterleavedRGB(
    outFloat: Float32Array,
    outH: number,
    outW: number,
    cropH: number,
    cropW: number
): Buffer {
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
    return outRaw
}

/**
 * 单块超分：归一化 → 补边 → 推理 → 裁回补边 → 交错 RGB
 * @returns 2x 放大后的交错 RGB Buffer 与尺寸
 */
async function runUpscaleTile(
    model: OnnxModel,
    data: Buffer,
    srcW: number,
    srcH: number
): Promise<{ data: Buffer; width: number; height: number }> {
    const padded = padToAlign(toNCHWNormalized(data, srcW, srcH), srcW, srcH)

    const inputMeta = model.session.inputMetadata[0]
    if (!inputMeta?.isTensor) throw new Error(`模型 ${model.path} 没有有效的输入张量`)
    // 动态维度(如 [1,3,"s53","s0"])替换为实际尺寸;shape 类型声明为 number,运行时可能是符号字符串
    const dims = inputMeta.shape.map((d, idx) => {
        if (typeof d === 'number' && d > 0) return d
        if (idx === 2) return padded.height
        if (idx === 3) return padded.width
        return 1
    })

    const tensor = await createInputTensor(model, inputMeta.name, padded.data, dims)
    const result = await runOnnxModel(model, { [inputMeta.name]: tensor })

    const outputMeta = model.session.outputMetadata[0]
    if (!outputMeta?.isTensor) throw new Error(`模型 ${model.path} 没有有效的输出张量`)
    const outTensor = result[outputMeta.name]
    if (!outTensor) throw new Error(`模型 ${model.path} 推理结果缺少输出: ${outputMeta.name}`)
    const outH = outTensor.dims[2] ?? 0
    const outW = outTensor.dims[3] ?? 0
    const cropH = Math.round(srcH * (outH / padded.height))
    const cropW = Math.round(srcW * (outW / padded.width))

    return {
        data: toInterleavedRGB(tensorToFloat32(outTensor), outH, outW, cropH, cropW),
        width: cropW,
        height: cropH
    }
}

/**
 * 用 ONNX 模型对图片做 2x 超分
 * @param model 已加载的模型
 * @param inputImage sharp 图像管道（尚未开始输出）
 * @returns 超分后的交错 RGB Buffer 与尺寸
 * @remark 奇数边会裁掉 1px 再超分；任一边超过 TILE_THRESHOLD 时按 TILE_SIZE 网格
 *         切块（相邻块重叠 TILE_OVERLAP 像素消除接缝，只贴回中心区），否则整图推理
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

    // 转 RGB raw，归一化与切块都在内存中完成
    const { data, info } = await image
        .removeAlpha()
        .toColourspace('srgb')
        .raw()
        .toBuffer({ resolveWithObject: true })
    const srcW = info.width
    const srcH = info.height

    // 任一边未超阈值时整图推理
    if (srcW <= TILE_THRESHOLD && srcH <= TILE_THRESHOLD) {
        return runUpscaleTile(model, data, srcW, srcH)
    }

    // 超过阈值按网格切块：每块的推理范围含重叠边缘，贴回时只保留中心区
    const outW = srcW * 2
    const outH = srcH * 2
    const outRaw = Buffer.alloc(outW * outH * 3)

    for (let y = 0; y < srcH; y += TILE_SIZE) {
        for (let x = 0; x < srcW; x += TILE_SIZE) {
            // 含重叠的实际取图范围（边界处收缩到图内）
            const left = Math.max(0, x - TILE_OVERLAP)
            const top = Math.max(0, y - TILE_OVERLAP)
            const right = Math.min(srcW, x + TILE_SIZE + TILE_OVERLAP)
            const bottom = Math.min(srcH, y + TILE_SIZE + TILE_OVERLAP)
            const tileW = right - left
            const tileH = bottom - top

            // 从整图 raw 按行裁出块（交错 RGB）
            const tileData = Buffer.alloc(tileW * tileH * 3)
            for (let row = 0; row < tileH; row++) {
                const srcStart = ((top + row) * srcW + left) * 3
                data.copy(tileData, row * tileW * 3, srcStart, srcStart + tileW * 3)
            }
            const result = await runUpscaleTile(model, tileData, tileW, tileH)

            // 贴回中心有效区（去掉重叠），输出坐标 ×2
            const copyW = Math.min(TILE_SIZE, srcW - x) * 2
            const copyH = Math.min(TILE_SIZE, srcH - y) * 2
            const srcX = (x - left) * 2
            const srcY = (y - top) * 2
            const dstX = x * 2
            const dstY = y * 2
            for (let row = 0; row < copyH; row++) {
                const srcStart = ((srcY + row) * result.width + srcX) * 3
                const dstStart = ((dstY + row) * outW + dstX) * 3
                result.data.copy(outRaw, dstStart, srcStart, srcStart + copyW * 3)
            }
        }
    }

    return { data: outRaw, width: outW, height: outH }
}
