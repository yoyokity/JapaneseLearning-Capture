import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import sharp from 'sharp'
import { v7 } from 'uuid'

import { appPath } from '../globalStates'
import { Cmd } from '../helper/shell'

/**
 * sharp支持读取的图像数据类型，也包括本地路径文本
 */
export type ImageData =
    | ArrayBuffer
    | Uint8Array
    | Uint8ClampedArray
    | Int8Array
    | Uint16Array
    | Int16Array
    | Uint32Array
    | Int32Array
    | Float32Array
    | Float64Array
    | string

/**
 * 图像位置信息
 */
export interface ImageCropPos {
    left: number
    top: number
    width: number
    height: number
}

export interface SaveImageOptions {
    /**
     * 裁剪选项
     */
    crop?: ImageCropPos
    /**
     * 等比缩放选项
     */
    scale?: {
        maxWidth: number
        maxHeight: number
    }
}

/**
 * 图像数据信息，包含了ArrayBuffer和图像信息
 */
export interface ImageDataInfo {
    /**
     * PNG格式的无损 ArrayBuffer 数据
     * @remark 这个数据传入saveImage是有效的
     */
    data: ArrayBuffer
    /**
     * RAW格式的原始 ArrayBuffer 数据
     * @remark 这个数据传入saveImage是无效的
     */
    rawData: ArrayBuffer
    info: sharp.OutputInfo
}

/**
 * 按最大边限制等比缩放图片
 */
const resizeByMaxSide = async (input: sharp.Sharp, maxSide: number) => {
    const metadata = await input.metadata()
    const { width, height } = metadata

    if (!width || !height) {
        return input
    }

    const longestSide = Math.max(width, height)
    if (longestSide <= maxSide) {
        return input
    }

    return input.resize({
        width: width >= height ? maxSide : undefined,
        height: height > width ? maxSide : undefined,
        fit: 'inside',
        withoutEnlargement: true,
        kernel: sharp.kernel.mks2021
    })
}

/**
 * 保存图片
 */
export async function saveImage(imageData: ImageData, path: string, options?: SaveImageOptions) {
    const { crop, scale } = options || {}

    let image = sharp(imageData).ensureAlpha()

    // 裁剪图片
    if (crop) image.extract(crop)

    // 缩放图片
    if (scale) {
        const { maxWidth, maxHeight } = scale
        const data = await image.toBuffer()
        const re = await useImageMagick(data, [
            '-filter',
            'Lanczos',
            '-resize',
            `${maxWidth}x${maxHeight}`
        ])

        if (re) image = sharp(re)
    }

    await image.jpeg({ quality: 92 }).toFile(path)
}

/**
 * 读取图片
 */
export async function readImage(path: string): Promise<ImageDataInfo> {
    const img = sharp(path).ensureAlpha()
    const srcImage = await img.png().toBuffer({ resolveWithObject: true })
    const raw = await img.raw().toBuffer()

    return {
        data: new Uint8Array(srcImage.data).buffer,
        rawData: new Uint8Array(raw).buffer,
        info: srcImage.info
    }
}

/**
 * 读取媒体信息
 */
export async function readMediaInfo(path: string) {
    const ars = ['--Output=JSON', path]
    const mediainfoPath = join(appPath.extraResource, 'tools/mediainfo/MediaInfo.exe')

    return await new Promise<string>((resolve, reject) => {
        const mediainfo = new Cmd(mediainfoPath)
        const cmd = mediainfo.run(ars)
        cmd.onExit(async (code, text) => {
            if (code === 0) {
                resolve(text)
            } else {
                reject(new Error(text))
            }
        })
    })
}

/**
 * 超分图片
 */
export async function superResolutionImage(imagePath: string, anime: boolean = false) {
    // 保存图片到 temp
    const tempPath = app.getPath('temp')

    const tempFileId = v7()
    const tempImageBefore = join(tempPath, `${tempFileId}_realesrgan_before.png`)
    const tempImageAfter = join(tempPath, `${tempFileId}_realesrgan_after.png`)
    const tempResultPath = join(tempPath, `${tempFileId}_super_resolution.jpg`)
    const sourceImageData = await fs.promises.readFile(imagePath)

    const inputImage = await resizeByMaxSide(sharp(sourceImageData), 1080)
    await inputImage.toFile(tempImageBefore)

    const ars = [
        '-i',
        tempImageBefore,
        '-o',
        tempImageAfter,
        '-n',
        anime ? 'realesrgan-x4plus-anime' : 'realesrgan-x4plus'
    ]

    const realesrganPath = join(
        appPath.extraResource,
        'tools/realesrgan/realesrgan-ncnn-vulkan.exe'
    )

    return await new Promise<string>((resolve, reject) => {
        const realesrgan = new Cmd(realesrganPath)
        const cmd = realesrgan.run(ars)
        cmd.onExit(async (code, text) => {
            if (code === 0) {
                // 使用 sharp 转换为 jpg，质量 92，返回 temp 路径
                const outputImage = await resizeByMaxSide(sharp(tempImageAfter), 3840)
                await outputImage.jpeg({ quality: 92 }).toFile(tempResultPath)
                resolve(tempResultPath)
            } else {
                reject(new Error(text))
            }
        })
    })
}

export async function useImageMagick(
    imageData: ImageData,
    args: string[]
): Promise<ArrayBuffer | null> {
    try {
        const imageBuffer = await sharp(imageData).ensureAlpha().png().toBuffer()
        const imageMagickPath = join(appPath.extraResource, 'tools/ImageMagick/magick.exe')

        // 使用 spawn 启动 ImageMagick，指定从 stdin 读取
        const magickProcess = spawn(imageMagickPath, [
            'png:-', // 输入格式 png，从 stdin 读取
            ...args,
            'png:-' // 输出格式 png，写入 stdout
        ])

        const stdoutChunks: Buffer[] = []
        magickProcess.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk))

        return await new Promise((resolve) => {
            magickProcess.stdin.on('error', () => resolve(null))
            magickProcess.stdin.end(imageBuffer)

            magickProcess.on('close', (code) => {
                if (code !== 0) {
                    resolve(null)
                    return
                }

                const outputBuffer = Buffer.concat(stdoutChunks)
                if (!outputBuffer.length) {
                    resolve(null)
                    return
                }

                // 转换为 ArrayBuffer 并返回
                resolve(
                    outputBuffer.buffer.slice(
                        outputBuffer.byteOffset,
                        outputBuffer.byteOffset + outputBuffer.byteLength
                    )
                )
            })

            magickProcess.on('error', () => resolve(null))
        })
    } catch {
        return null
    }
}
