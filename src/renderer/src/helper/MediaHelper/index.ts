import type { Path } from '@renderer/helper'
import type {
    IMediaInfo,
    IMediaInfoAudioTrack,
    IMediaInfoGeneralTrack,
    IMediaInfoTextTrack,
    IMediaInfoTrack,
    IMediaInfoVideoTrack
} from '@renderer/helper/MediaHelper/type'
import type {
    ImageCropPos,
    ImageData,
    ImageDataInfo,
    ImageResizeOptions,
    SaveImageOptions
} from '@shared'
import type { Mat } from '@techstark/opencv-js'

import { LogHelper, PathHelper, StringHelper, TaskHelper } from '@renderer/helper'
import { ipc } from '@renderer/ipc'
import cvModule from '@techstark/opencv-js'
import { v7 } from 'uuid'

/** 媒体相关 */
export class MediaHelper {
    /**
     * 将本地图片路径转换为 img 可识别的本地协议 URL
     * @param path 本地图片路径
     * @param cacheVersion 缓存版本，用于强制刷新同路径图片
     * @returns 本地协议 URL
     */
    static toLocalFileUrl(path: Path | string, cacheVersion?: string | number): string {
        const normalizedPath = path.toString().replace(/\\/g, '/')
        const encodedPath = normalizedPath
            .split('/')
            .map((item, index) => {
                if (index === 0 && /^[A-Z]:$/i.test(item)) {
                    return item
                }
                return StringHelper.encodeUrl(item)
            })
            .join('/')

        const baseUrl = `local-file:///${encodedPath}`
        if (cacheVersion === undefined || cacheVersion === null || cacheVersion === '') {
            return baseUrl
        }

        return `${baseUrl}?v=${StringHelper.encodeUrl(cacheVersion.toString())}`
    }

    /**
     * 读取本地图片
     */
    static async readImage(path: Path | string): Promise<ImageDataInfo | null> {
        const re = await TaskHelper.tryExecute(() => ipc.media.readImage.query(path.toString()))
        if (!re.hasError) {
            return re.result
        } else {
            LogHelper.error(`读取图片失败：`, re.error)
            return null
        }
    }

    /**
     * 保存图片为jpg
     * @param imageData 图片数据
     * @param path 图片路径
     * @param options 保存选项
     */
    static async saveImage(imageData: ImageData, path: Path | string, options?: SaveImageOptions) {
        const re = await TaskHelper.tryExecute(() =>
            ipc.media.saveImage.mutate({
                imageData,
                path: path.toString(),
                options
            })
        )
        if (!re.hasError) {
            return re.result
        } else {
            LogHelper.error(`保存图片失败：`, re.error)
        }
    }

    /**
     * 保存图片到临时目录并返回本地路径，自动保存为jpg
     * @param imageData 图片数据
     * @param name 临时文件名，默认为随机uuid。如果传入，会自动加上uuid
     * @param options 保存选项
     * @returns 临时图片路径
     */
    static async saveTempImage(
        imageData: ImageData,
        name: string = v7(),
        options?: SaveImageOptions
    ): Promise<string | null> {
        const uniqueName = `${name}_${v7()}`
        const tempImagePath = PathHelper.tempPath.join(`${uniqueName}.jpg`)
        const result = await TaskHelper.tryExecute(() =>
            ipc.media.saveImage.mutate({
                imageData,
                path: tempImagePath.toString(),
                options
            })
        )
        if (!result.hasError) {
            return tempImagePath.toString()
        } else {
            LogHelper.error(`保存临时图片失败：`, result.error)
            return null
        }
    }

    /**
     * 超分辨率处理图片并返回临时图片路径
     * @param imagePath 原图路径
     * @param anime 是否为动漫图片，默认false
     * @returns 超分后的本地图片路径
     * @remarks 输出的图片任意一边的长度不会高于3840
     */
    static async superResolutionImage(
        imagePath: Path | string,
        anime: boolean = false
    ): Promise<string | null> {
        const re = await TaskHelper.queueWithInterval(
            {
                taskName: 'super-resolution-image'
            },
            async () =>
                await TaskHelper.tryExecute(
                    async () =>
                        await ipc.media.superResolutionImage.mutate({
                            imagePath: imagePath.toString(),
                            anime
                        })
                )
        )

        if (!re.hasError) {
            return re.result
        } else {
            LogHelper.error(`超分辨率处理图片失败：`, re.error)
            return null
        }
    }

    /**
     * 从 ArrayBuffer 中获取图片信息
     * @param buffer 图片数据
     * @returns 图片宽度和高度
     */
    static async getImageInfoFromArrayBuffer(
        buffer: ArrayBuffer
    ): Promise<{ width: number; height: number }> {
        const blob = new Blob([buffer])
        const bitmap = await createImageBitmap(blob)
        const { width, height } = bitmap
        bitmap.close() // 释放 GPU 资源
        return { width, height }
    }

    /**
     * 从图片URL获取图片信息
     * @param url 图片URL
     * @returns 图片宽度和高度
     */
    static getImageInfoFromUrl(url: string): Promise<{ width: number; height: number }> {
        return new Promise((resolve, reject) => {
            const img = new Image()

            img.onload = () => {
                resolve({
                    width: img.naturalWidth,
                    height: img.naturalHeight
                })
            }

            img.onerror = () => {
                reject(new Error(`无法加载图片: ${url}`))
            }

            img.src = url // 开始加载
        })
    }

    /**
     * 读取媒体信息
     * @param path 媒体文件路径
     * @returns 媒体信息
     */
    static async readMediaInfo(path: Path | string): Promise<MediaInfo | null> {
        const re = await TaskHelper.queueWithInterval(
            {
                taskName: 'read-media-info'
            },
            async () =>
                await TaskHelper.tryExecute(() => ipc.media.readMediaInfo.query(path.toString()))
        )

        if (!re.hasError) {
            return new MediaInfo((JSON.parse(re.result) as IMediaInfo).media.track)
        } else {
            LogHelper.error(`读取媒体信息失败：`, re.error)
            return null
        }
    }

    private static cv: typeof cvModule | null = null

    /**
     * 将 Mat 转成 PNG 格式的 ArrayBuffer
     * @param mat OpenCV Mat
     * @returns PNG 格式的 ArrayBuffer 数据
     */
    private static async matToArrayBuffer(mat: Mat): Promise<ArrayBuffer | null> {
        if (!this.cv) this.cv = (await getOpenCv()).cv

        const cv = this.cv
        if (!cv) {
            LogHelper.error('OpenCV 初始化失败')
            return null
        }

        const canvas = document.createElement('canvas')
        canvas.width = mat.cols
        canvas.height = mat.rows
        cv.imshow(canvas, mat)

        const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, 'image/png')
        )
        if (!blob) {
            LogHelper.error('图片转 Blob 失败')
            return null
        }

        return await blob.arrayBuffer()
    }

    /**
     * 查找模板图在源图中的位置
     * @param srcImagePath 本地源图路径
     * @param templImagePath 本地模板图路径
     */
    static async templateMatchImage(
        srcImagePath: Path | string,
        templImagePath: Path | string
    ): Promise<{
        srcImageData: ImageDataInfo
        templImageData: ImageDataInfo
        pos: ImageCropPos
    } | null> {
        if (!this.cv) this.cv = (await getOpenCv()).cv
        const cv = this.cv
        if (!cv) {
            LogHelper.error('OpenCV 初始化失败')
            return null
        }

        // 读取图片
        const srcImageData = await MediaHelper.readImage(srcImagePath)
        const templImageData = await MediaHelper.readImage(templImagePath)
        if (!srcImageData || !templImageData) return null

        const srcMat = new cv.Mat(srcImageData.info.height, srcImageData.info.width, cv.CV_8UC4)
        const templMat = new cv.Mat(
            templImageData.info.height,
            templImageData.info.width,
            cv.CV_8UC4
        )
        const srcGrayMat = new cv.Mat()
        const templGrayMat = new cv.Mat()

        try {
            srcMat.data.set(new Uint8Array(srcImageData.rawData))
            templMat.data.set(new Uint8Array(templImageData.rawData))

            // 转成灰度图，减少颜色差异对匹配结果的影响
            cv.cvtColor(srcMat, srcGrayMat, cv.COLOR_RGBA2GRAY)
            cv.cvtColor(templMat, templGrayMat, cv.COLOR_RGBA2GRAY)

            let bestMaxVal = Number.NEGATIVE_INFINITY
            let bestMaxLoc = { x: 0, y: 0 }
            let bestSize = { width: templGrayMat.cols, height: templGrayMat.rows }
            const scaleByWidth = srcGrayMat.cols / templGrayMat.cols
            const scaleByHeight = srcGrayMat.rows / templGrayMat.rows
            const candidates = [
                {
                    scale: scaleByWidth,
                    width: srcGrayMat.cols,
                    height: Math.round(templGrayMat.rows * scaleByWidth)
                },
                {
                    scale: scaleByHeight,
                    width: Math.round(templGrayMat.cols * scaleByHeight),
                    height: srcGrayMat.rows
                }
            ].filter(
                (item, index, list) =>
                    item.width <= srcGrayMat.cols &&
                    item.height <= srcGrayMat.rows &&
                    list.findIndex(
                        (candidate) =>
                            candidate.width === item.width && candidate.height === item.height
                    ) === index
            )

            for (const candidate of candidates) {
                const scaledTemplMat = new cv.Mat()
                const resultMat = new cv.Mat()

                try {
                    // 模板图等比缩放到宽或高与原图一致，再查找其在原图中的位置
                    cv.resize(
                        templGrayMat,
                        scaledTemplMat,
                        new cv.Size(candidate.width, candidate.height),
                        0,
                        0,
                        cv.INTER_AREA
                    )
                    cv.matchTemplate(srcGrayMat, scaledTemplMat, resultMat, cv.TM_CCOEFF_NORMED)

                    const { maxLoc, maxVal } = (cv.minMaxLoc as any)(resultMat)

                    if (maxVal > bestMaxVal) {
                        bestMaxVal = maxVal
                        bestMaxLoc = maxLoc
                        bestSize = {
                            width: candidate.width,
                            height: candidate.height
                        }
                    }
                } finally {
                    scaledTemplMat.delete()
                    resultMat.delete()
                }
            }

            const left = bestMaxLoc.x
            const top = bestMaxLoc.y
            const width = bestSize.width
            const height = bestSize.height

            return {
                srcImageData,
                templImageData,
                pos: { left, top, width, height }
            }
        } catch (error) {
            LogHelper.error('图片模板匹配失败', error)
            return null
        } finally {
            srcMat.delete()
            templMat.delete()
            srcGrayMat.delete()
            templGrayMat.delete()
        }
    }

    /**
     * 图片缩放
     * @param imageData 图片数据
     * @param options 缩放选项
     * @returns 缩放后的图片数据
     */
    static async resizeImage(
        imageData: ImageData,
        options: ImageResizeOptions
    ): Promise<ArrayBuffer | null> {
        const re = await TaskHelper.tryExecute(() =>
            ipc.media.resizeImage.mutate({
                imageData,
                options
            })
        )

        if (!re.hasError) {
            return re.result
        } else {
            LogHelper.error(`图片缩放失败：`, re.error)
            return null
        }
    }

    // TODO 改成和sharp一样的用法
}

export class MediaInfo {
    _track: IMediaInfoTrack[]

    constructor(track: IMediaInfoTrack[]) {
        this._track = track
    }

    general(): IMediaInfoGeneralTrack {
        return this._track.find((item) => item['@type'] === 'General')!
    }

    video(): IMediaInfoVideoTrack[] {
        return this._track.filter((item) => item['@type'] === 'Video')
    }

    audio(): IMediaInfoAudioTrack[] {
        return this._track.filter((item) => item['@type'] === 'Audio')
    }

    text(): IMediaInfoTextTrack[] {
        return this._track.filter((item) => item['@type'] === 'Text')
    }
}

export async function getOpenCv(): Promise<{ cv: typeof cvModule }> {
    let cv: typeof cvModule
    if (cvModule instanceof Promise) {
        cv = await cvModule
    } else {
        if (cvModule.Mat) {
            // already initialized
            cv = cvModule
        } else {
            await new Promise<void>((resolve) => {
                cvModule.onRuntimeInitialized = () => resolve()
            })
            cv = cvModule
        }
    }
    return { cv }
}
