import { invoke } from '@renderer/ipc/func.ts'

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

export const image = {
    /**
     * 保存图片
     * @param imageData 图片数据
     * @param path 保存路径
     */
    saveImage: (imageData: ImageData, path: string): Promise<void> =>
        invoke('image:save', imageData, path),

    /**
     * 读取图片为 Data URL
     * @param path 图片路径
     */
    readImage: (path: string): Promise<ArrayBuffer> => invoke('image:read', path),

    /**
     * 超分辨率处理图片
     * @param imageData 图片数据
     * @param anime 是否为动漫图片，默认为false
     * @returns 超分后的图片ArrayBuffer
     */
    superResolutionImage: (imageData: ImageData, anime: boolean = false): Promise<ArrayBuffer> =>
        invoke('image:superResolution', imageData, anime)
}
