import type { ImageData } from '@shared'

import { trpcClient } from '@renderer/ipc/func.ts'

export type { ImageData } from '@shared'

export const image = {
    /**
     * 保存图片
     * @param imageData 图片数据
     * @param path 保存路径
     */
    saveImage: (imageData: ImageData, path: string): Promise<void> =>
        trpcClient.image.saveImage.mutate({
            imageData,
            path
        }),

    /**
     * 读取图片为 Data URL
     * @param path 图片路径
     */
    readImage: (path: string): Promise<ArrayBuffer> =>
        trpcClient.image.readImage.query(path) as Promise<ArrayBuffer>,

    /**
     * 超分辨率处理图片
     * @param imagePath 原图路径
     * @param anime 是否为动漫图片，默认为false
     * @returns 超分后的临时图片路径
     */
    superResolutionImage: (imagePath: string, anime: boolean = false): Promise<string> =>
        trpcClient.image.superResolutionImage.mutate({
            imagePath,
            anime
        })
}
