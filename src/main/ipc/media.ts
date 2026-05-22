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

export interface ImageResize {
    maxWidth: number
    maxHeight: number
    minWidth: number
    minHeight: number
}

export interface ImageResizeWidthHeight {
    width: number
    height: number
}

export type ImageResizeOptions = ImageResize | ImageResizeWidthHeight

export interface SaveImageOptions {
    /**
     * 裁剪选项
     */
    crop?: ImageCropPos
    /**
     * 等比缩放选项
     * @remark 指定width和height，会按等比缩放，宽高均不超过指定值
     * @remark 指定最大最小值，如果图片宽高在指定范围内，不会缩放，否则会按最大边限制等比缩放
     */
    resize?: ImageResizeOptions
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
 * 按配置等比缩放图片
 */
const resize = async (input: sharp.Sharp, options: ImageResizeOptions) => {
    if (!options) return input

    const metadata = await input.metadata()
    const { width, height } = metadata

    if (!width || !height) {
        return input
    }

    if ('width' in options) {
        return input.resize({
            width: options.width,
            height: options.height,
            fit: 'inside',
            withoutEnlargement: true,
            kernel: sharp.kernel.mks2021
        })
    }

    if (
        width >= options.minWidth &&
        width <= options.maxWidth &&
        height >= options.minHeight &&
        height <= options.maxHeight
    ) {
        return input
    }

    // 小于最小值时按最小值放大，大于最大值时按最大值缩小
    const scaleRatio =
        width < options.minWidth || height < options.minHeight
            ? Math.max(options.minWidth / width, options.minHeight / height)
            : Math.min(options.maxWidth / width, options.maxHeight / height)

    return input.resize({
        width: Math.round(width * scaleRatio),
        height: Math.round(height * scaleRatio),
        fit: 'inside',
        kernel: sharp.kernel.mks2021
    })
}

export async function resizeImage(
    imageData: ImageData,
    options: ImageResizeOptions
): Promise<ArrayBuffer> {
    const image = await resize(sharp(imageData).ensureAlpha(), options)
    const buffer = await image.toBuffer()
    return new Uint8Array(buffer).buffer
}

/**
 * 保存图片
 */
export async function saveImage(imageData: ImageData, path: string, options?: SaveImageOptions) {
    const { crop, resize: scale } = options || {}

    let image = sharp(imageData).ensureAlpha()

    // 裁剪图片
    if (crop) image.extract(crop)

    // 缩放图片
    if (scale) image = await resize(image, scale)

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

    const inputImage = await resize(sharp(sourceImageData), {
        maxHeight: 1280,
        maxWidth: 1280,
        minWidth: -1,
        minHeight: -1
    })
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
                const outputImage = await resize(sharp(tempImageAfter), {
                    maxHeight: 3840,
                    maxWidth: 3840,
                    minWidth: -1,
                    minHeight: -1
                })
                await outputImage.jpeg({ quality: 92 }).toFile(tempResultPath)
                resolve(tempResultPath)
            } else {
                reject(new Error(text))
            }
        })
    })
}
