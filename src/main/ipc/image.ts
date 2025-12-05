import type { Buffer } from 'node:buffer'

import * as fs from 'node:fs'
import { join } from 'node:path'
import { app, ipcMain } from 'electron'
import sharp from 'sharp'

import { Cmd } from '../helper/shell'
import { appPath } from './app'
import { createDirectory } from './filesystem'
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
        await sharp(imageData).jpeg({ quality: 92 }).png({ quality: 100 }).toFile(path)
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
ipcMain.handle(
    'image:superResolution',
    async (_, imageData: ImageData, path: string, anime: boolean = false) => {
        return tryExecute(async () => {
            //保存图片到temp
            const tempPath = app.getPath('temp')

            //如果没有temp则创建
            createDirectory(tempPath)

            const tempImageBefore = join(tempPath, 'realesrgan_before.png')
            const tempImageAfter = join(tempPath, 'realesrgan_after.png')
            await sharp(imageData).toFile(tempImageBefore)

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

            return new Promise<void>((resolve, reject) => {
                const realesrgan = new Cmd(realesrganPath)
                const cmd = realesrgan.run(ars)
                cmd.onExit(async (code, text) => {
                    if (code === 0) {
                        //使用sharp保存为jpg，质量92
                        await sharp(tempImageAfter).jpeg({ quality: 92 }).toFile(path)
                        resolve()
                    } else {
                        reject(new Error(text))
                    }
                })
            })
        })
    }
)
