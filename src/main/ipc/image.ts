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

// 保存图片
ipcMain.handle('image:save', (_, imageData: ImageData, path: string) => {
    return tryExecute(async () => {
        await sharp(imageData).toFile(path)
    })
})

// 读取图片
ipcMain.handle('image:read', (_, path: string) => {
    return tryExecuteSync(() => {
        const data = fs.readFileSync(path)
        // 将图片数据转换成 Base64 字符串
        const base64String = data.toString('base64')

        // 根据文件扩展名判断 MIME 类型
        const ext = path.toLowerCase().split('.').pop() || ''
        let mimeType = 'image/jpeg' // 默认类型

        // 常见图片格式的 MIME 类型映射
        const mimeTypes: Record<string, string> = {
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            png: 'image/png',
            gif: 'image/gif',
            webp: 'image/webp',
            svg: 'image/svg+xml',
            bmp: 'image/bmp',
            ico: 'image/x-icon',
            tif: 'image/tiff',
            tiff: 'image/tiff'
        }

        if (ext in mimeTypes) {
            mimeType = mimeTypes[ext]!
        }

        return `data:${mimeType};base64,${base64String}`
    })
})

//超分图片
ipcMain.handle(
    'image:superResolution',
    async (_, imageData: ImageData, path: string, anime: boolean = false) => {
        return tryExecute(async () => {
            //保存图片到temp
            const tempPath = app.getPath('temp')
            const tempImageBefore = join(tempPath, 'realesrgan_before.png')
            await sharp(imageData).toFile(tempImageBefore)

            //超分
            const ars = [
                '-i',
                tempImageBefore,
                '-o',
                path,
                '-n',
                anime ? 'realesrgan-x4plus-anime' : 'realesrgan-x4plus'
            ]

            const realesrganPath = join(
                appPath.extraResource,
                'tools/realesrgan/realesrgan-ncnn-vulkan.exe'
            )

            return new Promise<void>((resolve, reject) => {
                const realesrgan = new Cmd(realesrganPath)
                const cmd = realesrgan.run(ars)
                cmd.onExit((code, text) => {
                    code === 0 ? resolve() : reject(new Error(text))
                })
            })
        })
    }
)
