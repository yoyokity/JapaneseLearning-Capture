import * as fs from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import sharp from 'sharp'
import { v7 } from 'uuid'

import { appPath } from '../globalStates'
import { Cmd } from '../helper/shell'

/**
 * 图像数据类型
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
export async function saveImage(imageData: ImageData, path: string, crop?: ImageCropPos) {
    const image = sharp(imageData)
    if (crop) image.extract(crop)
    await image.jpeg({ quality: 92 }).toFile(path)
}

/**
 * 图像位置信息
 */
export interface ImageCropPos {
    left: number
    top: number
    width: number
    height: number
}

/**
 * 图像数据信息，包含了ArrayBuffer和图像信息
 */
export interface ImageDataInfo {
    data: ArrayBuffer
    info: sharp.OutputInfo
}

/**
 * 读取图片
 */
export async function readImage(path: string): Promise<ImageDataInfo> {
    const srcImage = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const data = srcImage.data

    return {
        data: new Uint8Array(data).buffer,
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
