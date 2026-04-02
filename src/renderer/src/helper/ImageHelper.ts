import type { Path } from '@renderer/helper/PathHelper'
import type { ImageData } from '@renderer/ipc'

import { DebugHelper } from '@renderer/helper/DebugHelper'
import { Ipc } from '@renderer/ipc'

export class ImageHelper {
    /**
     * 将本地图片路径转换为 img 可识别的本地协议 URL
     * @param path 本地图片路径
     * @returns 本地协议 URL
     */
    static toLocalFileUrl(path: Path | string): string {
        return encodeURI(`local-file:///${path.toString().replace(/\\/g, '/')}`)
    }

    /**
     * 读取图片
     * @remarks 用时 <10ms
     * @param path 图片路径
     * @returns 图片数据
     */
    static async readImage(path: Path | string): Promise<ArrayBuffer | null> {
        const re = await DebugHelper.tryExecute(Ipc.image.readImage, path.toString())
        if (!re.hasError) {
            return re.result
        } else {
            DebugHelper.error(`读取图片失败：`, re.error)
            return null
        }
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
     * 超分辨率处理图片
     * @param imageData 图片数据
     * @param anime 是否为动漫图片，默认为false
     * @returns 超分后的图片ArrayBuffer
     */
    static async superResolutionImage(
        imageData: ImageData,
        anime: boolean = false
    ): Promise<ArrayBuffer | null> {
        const re = await DebugHelper.tryExecute(Ipc.image.superResolutionImage, imageData, anime)
        if (!re.hasError) {
            return re.result
        } else {
            DebugHelper.error(`超分辨率处理图片失败：`, re.error)
            return null
        }
    }
}
