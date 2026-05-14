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

import { EncodeHelper, LogHelper, PathHelper, TaskHelper } from '@renderer/helper'
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
                return EncodeHelper.encodeUrl(item)
            })
            .join('/')

        const baseUrl = `local-file:///${encodedPath}`
        if (cacheVersion === undefined || cacheVersion === null || cacheVersion === '') {
            return baseUrl
        }

        return `${baseUrl}?v=${EncodeHelper.encodeUrl(cacheVersion.toString())}`
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
    static async templateMatchIamge(
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

            const shouldScaleSrc =
                srcGrayMat.cols >= templGrayMat.cols && srcGrayMat.rows >= templGrayMat.rows
            const scaleStart = shouldScaleSrc
                ? 1
                : Math.min(srcGrayMat.cols / templGrayMat.cols, srcGrayMat.rows / templGrayMat.rows)
            const scaleEnd = shouldScaleSrc
                ? Math.max(templGrayMat.cols / srcGrayMat.cols, templGrayMat.rows / srcGrayMat.rows)
                : scaleStart
            const scaleCount = scaleStart === scaleEnd ? 1 : 30
            let bestScale = 1
            let bestMaxVal = Number.NEGATIVE_INFINITY
            let bestMaxLoc = { x: 0, y: 0 }

            for (let i = 0; i < scaleCount; i++) {
                const scale =
                    scaleCount === 1
                        ? scaleStart
                        : scaleStart - ((scaleStart - scaleEnd) * i) / (scaleCount - 1)
                const scaledWidth = Math.round(
                    (shouldScaleSrc ? srcGrayMat.cols : templGrayMat.cols) * scale
                )
                const scaledHeight = Math.round(
                    (shouldScaleSrc ? srcGrayMat.rows : templGrayMat.rows) * scale
                )
                const scaledMat = new cv.Mat()
                const resultMat = new cv.Mat()

                try {
                    // 谁大缩谁，尽量避免把小图放大后再做模板匹配
                    cv.resize(
                        shouldScaleSrc ? srcGrayMat : templGrayMat,
                        scaledMat,
                        new cv.Size(scaledWidth, scaledHeight),
                        0,
                        0,
                        cv.INTER_AREA
                    )

                    if (shouldScaleSrc) {
                        cv.matchTemplate(scaledMat, templGrayMat, resultMat, cv.TM_CCOEFF_NORMED)
                    } else {
                        cv.matchTemplate(srcGrayMat, scaledMat, resultMat, cv.TM_CCOEFF_NORMED)
                    }

                    const { maxLoc, maxVal } = (cv.minMaxLoc as any)(resultMat)

                    if (maxVal > bestMaxVal) {
                        bestScale = scale
                        bestMaxVal = maxVal
                        bestMaxLoc = maxLoc
                    }
                } finally {
                    scaledMat.delete()
                    resultMat.delete()
                }
            }

            const left = shouldScaleSrc ? Math.round(bestMaxLoc.x / bestScale) : bestMaxLoc.x
            const top = shouldScaleSrc ? Math.round(bestMaxLoc.y / bestScale) : bestMaxLoc.y
            const width = shouldScaleSrc
                ? Math.round(templGrayMat.cols / bestScale)
                : Math.round(templGrayMat.cols * bestScale)
            const height = shouldScaleSrc
                ? Math.round(templGrayMat.rows / bestScale)
                : Math.round(templGrayMat.rows * bestScale)

            return {
                srcImageData,
                templImageData,
                pos: {
                    left,
                    top,
                    width: Math.min(srcGrayMat.cols - left, width),
                    height: Math.min(srcGrayMat.rows - top, height)
                }
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
