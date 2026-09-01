import type { OutputInfo, Sharp } from 'sharp'
import type { CmdHandle } from '../helper/shell'

import * as fs from 'node:fs'
import { join } from 'node:path'
import { observable } from '@trpc/server/observable'
import { app } from 'electron'
import sharp from 'sharp'
import { v7 } from 'uuid'

import { appPath } from '../globalStates'
import { Cmd } from '../helper/shell'
import { imagePolishDir } from './models'

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
const resize = async (input: Sharp, options: ImageResizeOptions) => {
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
 * 调用 imagepolish 批量处理图片
 * @param inputPaths 输入图片路径数组
 * @param modelFilePath 模型文件绝对路径，为空时仅执行非AI修复链
 * @param onOk 每处理完一张图片（stdout 输出一行 "ok:"）时的回调，参数为已完成的张数
 * @remark 批量模式下 -o 会被忽略，每张输出为 <输入路径>_output.<同扩展名>
 */
const runImagePolish = (
    inputPaths: string[],
    modelFilePath: string,
    onOk?: (doneCount: number) => void
) =>
    new Promise<void>((resolve, reject) => {
        // 共用滤镜链，AI 与非AI仅 aa/sharpen/grain 强度不同，AI 额外在 dehalo 后接 --model
        const args: string[] = []
        for (const inputPath of inputPaths) {
            args.push('-i', inputPath)
        }
        args.push(
            '--denoise',
            '6',
            '--deband',
            'range=12,y=60,cbcr=24',
            '--deband',
            'range=24,y=40,cbcr=16',
            '--aa',
            modelFilePath ? '1' : '2',
            '--sharpen',
            modelFilePath ? '0.8' : '0.9',
            '--dehalo'
        )
        if (modelFilePath) {
            args.push('--model', modelFilePath)
        }
        args.push('--grain', modelFilePath ? '15' : '10')

        const cmd = new Cmd(join(imagePolishDir(), 'imagepolish.exe')).run(args)

        // imagepolish 每完成一张会在 stdout 输出一行 "ok:"（已实时 flush），按行统计已完成张数
        let pendingText = ''
        let doneCount = 0
        cmd.onOutputLine((text) => {
            pendingText += text
            const lines = pendingText.split('\n')
            pendingText = lines.pop() ?? ''
            for (const line of lines) {
                if (line.startsWith('ok:')) {
                    onOk?.(++doneCount)
                }
            }
        })

        cmd.onExit((code, _stdout, stderr) => {
            if (code === 0) {
                resolve()
            } else {
                reject(new Error(stderr || `imagepolish exited with code ${code}`))
            }
        })
    })

/**
 * 批量超分图片（imagepolish）
 * @param imagePaths 输入图片路径数组
 * @param modelPath 模型文件名（image-polish/models 目录下的 .onnx 文件名，空串表示非AI修复）
 * @param onProgress 进度回调 0-1，每处理完一张图片递增 1/总数
 * @returns 超分后的本地图片路径数组，单张失败的项为 null
 */
export async function superResolutionImage(
    imagePaths: string[],
    modelPath: string,
    onProgress?: (progress: number) => void
): Promise<(string | null)[]> {
    const modelFilePath = modelPath ? join(imagePolishDir(), 'models', modelPath) : ''
    if (modelPath && !fs.existsSync(modelFilePath)) {
        throw new Error(`未知超分模型文件: ${modelPath}`)
    }

    const results = Array.from({ length: imagePaths.length }).fill(null) as (string | null)[]

    // 统一转成 PNG 临时输入副本（imagepolish 仅通过 stb_image 读取，webp 等需先转码；源文件只在转换瞬间被读取，之后与源文件完全隔离）
    const inputs: { index: number; path: string }[] = []
    for (const [index, imagePath] of imagePaths.entries()) {
        try {
            const tempInputPath = join(
                app.getPath('temp'),
                `${v7()}_super_resolution_input_${index}.png`
            )
            await sharp(imagePath).removeAlpha().png().toFile(tempInputPath)
            inputs.push({ index, path: tempInputPath })
        } catch (error) {
            console.warn(`[super-resolution] 单张超分失败：${imagePath}`, error)
        }
    }

    try {
        // 一次调用批量处理，避免每张重新启动进程重复加载 GPU 与模型
        if (inputs.length) {
            // 批处理进度按 stdout 的 "ok:" 行推进，每完成一张递增 1/总数
            await runImagePolish(
                inputs.map((item) => item.path),
                modelFilePath,
                (doneCount) => onProgress?.(doneCount / inputs.length)
            )
        }
    } catch (error) {
        console.warn('[super-resolution] 批量超分失败', error)
        await Promise.all(
            inputs.map((item) => fs.promises.rm(item.path, { force: true }).catch(() => {}))
        )
        return results
    }

    for (const { index, path: tempInputPath } of inputs) {
        // 批量模式下输出为 <输入>_output.<同扩展名>
        const rawResultPath = tempInputPath.replace(/\.png$/, '_output.png')
        try {
            // 输出最长边不超过 3840，保存 jpeg
            const outputImage = await resize(sharp(rawResultPath), {
                maxHeight: 3840,
                maxWidth: 3840,
                minWidth: -1,
                minHeight: -1
            })
            const tempResultPath = join(app.getPath('temp'), `${v7()}_super_resolution.jpg`)
            await outputImage.jpeg({ quality: 92 }).toFile(tempResultPath)
            results[index] = tempResultPath
        } catch (error) {
            console.warn(`[super-resolution] 单张超分失败：${imagePaths[index]}`, error)
        } finally {
            // 清理临时输入副本与中间结果
            await fs.promises.rm(tempInputPath, { force: true }).catch(() => {})
            await fs.promises.rm(rawResultPath, { force: true }).catch(() => {})
        }
    }
    return results
}

/**
 * 超分进度信息
 */
export interface ISuperResolutionProgress {
    /**
     * 总进度 0-1
     */
    progress: number
    /**
     * 全部完成后的结果数组（仅最后一次回调携带）
     */
    results?: (string | null)[]
}

/**
 * 订阅式批量超分，逐张推进度并在全部完成后回传结果数组
 */
export function createSuperResolutionImageStream(imagePaths: string[], modelPath: string) {
    return observable<ISuperResolutionProgress>((emit) => {
        void (async () => {
            try {
                const results = await superResolutionImage(imagePaths, modelPath, (progress) => {
                    emit.next({ progress })
                })
                emit.next({ progress: 1, results })
                emit.complete()
            } catch (error) {
                emit.error(error instanceof Error ? error : new Error(String(error)))
            }
        })()

        return {
            unsubscribe() {}
        }
    })
}

/**
 * 音频重编码进度信息
 */
export interface IReencodeAudioProgress {
    /**
     * 进度 0-1，读取不到总时长时为 -1
     */
    progress: number
    /**
     * 当前处理到的时间（秒）
     */
    time: number
}

/**
 * 正在进行的音频重编码输出路径，防止同一输出被多个 ffmpeg 同时写入
 */
const activeEncodes = new Set<string>()

/**
 * 使用 ffmpeg 重编码音频并推送进度
 * ffmpeg -i input.mkv -map 0 -c copy -c:a aac -ar 48000 -b:a 320k output.mkv
 * @remark 总时长取自 ffmpeg 输入信息中的 Duration 行，进度 = 当前 time / 总时长（视频为直拷时 frame 不增长，不能用作进度）
 * @remark 取消订阅时会终止 ffmpeg 进程
 */
export function createReencodeAudioStream(
    inputPath: string,
    outputPath: string,
    codec: string,
    sampleRate: number,
    bitrate: string
) {
    return observable<IReencodeAudioProgress>((emit) => {
        let cmdHandle: CmdHandle | null = null
        let isCancelled = false

        void (async () => {
            if (activeEncodes.has(outputPath)) {
                emit.error(new Error('该输出文件已有编码任务在进行中'))
                return
            }

            const ffmpegPath = join(appPath.extraResource, 'tools/ffmpeg/ffmpeg.exe')
            const args = [
                '-y',
                '-i',
                inputPath,
                '-map',
                '0',
                '-c',
                'copy',
                '-c:a',
                codec,
                '-ar',
                String(sampleRate),
                '-b:a',
                bitrate,
                outputPath
            ]

            // ffmpeg 将进度实时输出到 stderr 并用 \r 刷新同一行，直接对收到的数据块全局匹配：
            // 总时长取输入信息里的 “Duration: HH:MM:SS.ms”，当前时间取最新统计行的 time=
            let pendingText = ''
            let totalDuration: number | null = null
            let lastTime = 0

            try {
                activeEncodes.add(outputPath)

                await new Promise<void>((resolve, reject) => {
                    const ffmpeg = new Cmd(ffmpegPath)
                    const cmd = ffmpeg.run(args)
                    cmdHandle = cmd

                    cmd.onErrorLine((text) => {
                        if (isCancelled) return
                        pendingText += text

                        const durationMatch = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(
                            pendingText
                        )
                        if (durationMatch) {
                            const [, h, m, s] = durationMatch
                            const duration = Number(h) * 3600 + Number(m) * 60 + Number(s)
                            if (duration > 0) totalDuration = duration
                        }

                        const matches = [
                            ...pendingText.matchAll(/time=\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/g)
                        ]
                        const lastMatch = matches.at(-1)
                        if (lastMatch) {
                            const [, h, m, s] = lastMatch
                            const time = Number(h) * 3600 + Number(m) * 60 + Number(s)
                            if (time !== lastTime) {
                                lastTime = time
                                emit.next({
                                    progress: totalDuration
                                        ? Math.min(time / totalDuration, 1)
                                        : -1,
                                    time
                                })
                            }
                        }

                        // 只保留尾部片段，防止缓冲无限增长，同时能拼回被数据块截断的关键字（最长的 Duration 行部分匹配约 26 字符）
                        if (pendingText.length > 128) {
                            pendingText = pendingText.slice(-64)
                        }
                    })

                    cmd.onExit((code, _stdout, stderr) => {
                        if (code !== 0) {
                            reject(new Error(stderr || `ffmpeg exited with code ${code}`))
                            return
                        }

                        // 校验输出文件确实写入成功，避免把源文件误移入回收站
                        try {
                            if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
                                resolve()
                            } else {
                                reject(new Error(`输出文件为空或不存在：${outputPath}`))
                            }
                        } catch {
                            reject(new Error(`无法读取输出文件：${outputPath}`))
                        }
                    })
                })

                emit.next({ progress: totalDuration ? 1 : -1, time: totalDuration ?? lastTime })
                emit.complete()
            } catch (error) {
                if (!isCancelled) {
                    emit.error(error instanceof Error ? error : new Error(String(error)))
                }
            } finally {
                activeEncodes.delete(outputPath)
            }
        })()

        return {
            unsubscribe() {
                isCancelled = true
                cmdHandle?.kill()
            }
        }
    })
}
