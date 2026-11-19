import type { OutputInfo, Sharp } from 'sharp'

import sharp from 'sharp'

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
    info: OutputInfo
}

/**
 * 按配置等比缩放图片
 */
export const resize = async (input: Sharp, options: ImageResizeOptions) => {
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
