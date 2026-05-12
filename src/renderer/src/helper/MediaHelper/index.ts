import type { Path } from '@renderer/helper'
import type {
    IMediaInfo,
    IMediaInfoAudioTrack,
    IMediaInfoGeneralTrack,
    IMediaInfoTextTrack,
    IMediaInfoTrack,
    IMediaInfoVideoTrack
} from '@renderer/helper/MediaHelper/type'
import type { ImageData, ImageDataInfo } from '@shared'

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
     */
    static async saveImage(imageData: ImageData, path: Path | string) {
        const re = await TaskHelper.tryExecute(() =>
            ipc.media.saveImage.mutate({
                imageData,
                path: path.toString()
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
     * @returns 临时图片路径
     */
    static async saveTempImage(imageData: ImageData, name: string = v7()): Promise<string | null> {
        const uniqueName = `${name}_${v7()}`
        const tempImagePath = PathHelper.tempPath.join(`${uniqueName}.jpg`)
        const result = await TaskHelper.tryExecute(() =>
            ipc.media.saveImage.mutate({
                imageData,
                path: tempImagePath.toString()
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
     * @param anime 是否为动漫图片
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
     * 查找模板图在源图中的位置
     */
    static async templateMatchIamge(srcImage: string, templImage: string) {
        if (!this.cv) this.cv = (await getOpenCv()).cv

        const cv = this.cv
        if (!cv) {
            LogHelper.error('OpenCV 初始化失败')
            return null
        }

        const srcImageData = await MediaHelper.readImage(srcImage)
        const templImageData = await MediaHelper.readImage(templImage)
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
            srcMat.data.set(new Uint8Array(srcImageData.data))
            templMat.data.set(new Uint8Array(templImageData.data))

            // 转成灰度图，减少颜色差异对匹配结果的影响
            cv.cvtColor(srcMat, srcGrayMat, cv.COLOR_RGBA2GRAY)
            cv.cvtColor(templMat, templGrayMat, cv.COLOR_RGBA2GRAY)

            let bestScale = 1
            let bestMaxVal = Number.NEGATIVE_INFINITY
            let bestMaxLoc = { x: 0, y: 0 }
            const minScale = Math.max(
                templGrayMat.cols / srcGrayMat.cols,
                templGrayMat.rows / srcGrayMat.rows
            )
            const scaleCount = 30

            for (let i = 0; i < scaleCount; i++) {
                const scale = 1 - ((1 - minScale) * i) / (scaleCount - 1)
                const scaledWidth = Math.round(srcGrayMat.cols * scale)
                const scaledHeight = Math.round(srcGrayMat.rows * scale)

                if (scaledWidth < templGrayMat.cols || scaledHeight < templGrayMat.rows) {
                    continue
                }

                const scaledSrcMat = new cv.Mat()
                const resultMat = new cv.Mat()

                try {
                    // 缩放源图，查找与模板尺寸最接近的原图区域
                    cv.resize(
                        srcGrayMat,
                        scaledSrcMat,
                        new cv.Size(scaledWidth, scaledHeight),
                        0,
                        0,
                        cv.INTER_AREA
                    )
                    cv.matchTemplate(scaledSrcMat, templGrayMat, resultMat, cv.TM_CCOEFF_NORMED)

                    // 当前 opencv-js 运行时支持单参数，类型声明与实际行为不一致
                    const { maxLoc, maxVal } = (cv.minMaxLoc as any)(resultMat)

                    if (maxVal > bestMaxVal) {
                        bestScale = scale
                        bestMaxVal = maxVal
                        bestMaxLoc = maxLoc
                    }
                } finally {
                    scaledSrcMat.delete()
                    resultMat.delete()
                }
            }

            const left = Math.round(bestMaxLoc.x / bestScale)
            const top = Math.round(bestMaxLoc.y / bestScale)
            const width = Math.round(templGrayMat.cols / bestScale)
            const height = Math.round(templGrayMat.rows / bestScale)

            return {
                leftTop: {
                    x: left,
                    y: top
                },
                width: Math.min(srcGrayMat.cols - left, width),
                height: Math.min(srcGrayMat.rows - top, height)
            }
        } finally {
            srcMat.delete()
            templMat.delete()
            srcGrayMat.delete()
            templGrayMat.delete()
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
