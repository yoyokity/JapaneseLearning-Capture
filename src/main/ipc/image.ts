import type { Buffer } from 'node:buffer'

import * as fs from 'node:fs'
import { join } from 'node:path'
import { app, ipcMain } from 'electron'
import sharp from 'sharp'

import { Cmd } from '../helper/shell'
import { appPath } from './app'
import { tryExecute, tryExecuteSync } from './func'

type ImageData =
    | Buffer
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

// 保存图片
ipcMain.handle('image:save', (_, imageData: ImageData, path: string) => {
    return tryExecute(async () => {
        await sharp(imageData).jpeg({ quality: 92 }).toFile(path)
    })
})

// 读取图片
ipcMain.handle('image:read', (_, path: string) => {
    return tryExecuteSync(() => {
        const data = fs.readFileSync(path)
        return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
    })
})

//超分图片
ipcMain.handle('image:superResolution', async (_, imagePath: string, anime: boolean = false) => {
    return tryExecute(async () => {
        //保存图片到temp
        const tempPath = app.getPath('temp')

        //如果没有temp则创建
        const tempFileId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        const tempImageBefore = join(tempPath, `realesrgan_before_${tempFileId}.png`)
        const tempImageAfter = join(tempPath, `realesrgan_after_${tempFileId}.png`)
        const tempResultPath = join(tempPath, `super_resolution_${tempFileId}.jpg`)
        const sourceImageData = await fs.promises.readFile(imagePath)

        const inputImage = await resizeByMaxSide(sharp(sourceImageData), 1080)
        await inputImage.toFile(tempImageBefore)

        //超分
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

        return new Promise<string>((resolve, reject) => {
            const realesrgan = new Cmd(realesrganPath)
            const cmd = realesrgan.run(ars)
            cmd.onExit(async (code, text) => {
                if (code === 0) {
                    //使用sharp转换为jpg，质量92，返回temp路径
                    const outputImage = await resizeByMaxSide(sharp(tempImageAfter), 3840)
                    await outputImage.jpeg({ quality: 92 }).toFile(tempResultPath)
                    resolve(tempResultPath)
                } else {
                    reject(new Error(text))
                }
            })
        })
    })
})
