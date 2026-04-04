import type { Path } from '@renderer/helper/PathHelper'
import type { ImageData } from '@renderer/ipc'

import { DebugHelper } from '@renderer/helper/DebugHelper'
import { Ipc } from '@renderer/ipc'

import { EncodeHelper } from './EncodeHelper'
import { PathHelper } from './PathHelper'

export class ImageHelper {
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
     * 保存图片
     * @remarks 用时 <10ms
     * @param imageData 图片数据
     * @param path 图片路径
     */
    static async saveImage(imageData: ImageData, path: Path | string) {
        const re = await DebugHelper.tryExecute(Ipc.image.saveImage, imageData, path.toString())
        if (!re.hasError) {
            return re.result
        } else {
            DebugHelper.error(`保存图片失败：`, re.error)
        }
    }

    /**
     * 保存图片到临时目录并返回本地路径
     * @param imageData 图片数据
     * @param name 临时文件名
     * @returns 临时图片路径
     */
    static async saveTempImage(
        imageData: ImageData,
        name: string = `image_${Date.now()}`
    ): Promise<string | null> {
        const uniqueName = `${name}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        const tempImagePath = PathHelper.tempPath.join(`${uniqueName}.jpg`)
        const result = await DebugHelper.tryExecute(
            Ipc.image.saveImage,
            imageData,
            tempImagePath.toString()
        )
        if (!result.hasError) {
            return tempImagePath.toString()
        } else {
            DebugHelper.error(`保存临时图片失败：`, result.error)
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
        const re = await DebugHelper.tryExecute(
            Ipc.image.superResolutionImage,
            imagePath.toString(),
            anime
        )
        if (!re.hasError) {
            return re.result
        } else {
            DebugHelper.error(`超分辨率处理图片失败：`, re.error)
            return null
        }
    }
}
