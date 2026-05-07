import type { Path } from '@renderer/helper/PathHelper'
import type { ImageData } from '@shared'

import { ipc } from '@renderer/ipc'
import { v7 } from 'uuid'

import { EncodeHelper } from './EncodeHelper'
import { LogHelper } from './LogHelper'
import { PathHelper } from './PathHelper'
import { TaskHelper } from './TaskHelper'

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
    static async readImage(path: Path | string): Promise<ArrayBuffer | null> {
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

/** MediaInfo 创建库信息 */
export interface IMediaInfoCreatingLibrary {
    name: string
    version: string
    url: string
}

/** MediaInfo 通用轨道附加信息 */
export interface IMediaInfoGeneralTrackExtra {
    Attachments: string
}

/** MediaInfo General 轨道 */
export interface IMediaInfoGeneralTrack {
    '@type': 'General'
    UniqueID: string
    VideoCount: string
    AudioCount: string
    TextCount: string
    FileExtension: string
    Format: string
    Format_Version: string
    FileSize: string
    Duration: string
    OverallBitRate: string
    FrameRate: string
    FrameCount: string
    StreamSize: string
    IsStreamable: string
    Encoded_Date: string
    File_Created_Date: string
    File_Created_Date_Local: string
    File_Modified_Date: string
    File_Modified_Date_Local: string
    Encoded_Application: string
    Encoded_Application_Name: string
    Encoded_Application_Version: string
    Encoded_Library: string
    extra?: IMediaInfoGeneralTrackExtra
}

/** MediaInfo Video 轨道 */
export interface IMediaInfoVideoTrack {
    '@type': 'Video'
    StreamOrder: string
    ID: string
    UniqueID: string
    Format: string
    Format_Profile: string
    Format_Level: string
    Format_Tier: string
    CodecID: string
    Duration: string
    BitRate: string
    Width: string
    Height: string
    Stored_Height: string
    Sampled_Width: string
    Sampled_Height: string
    PixelAspectRatio: string
    DisplayAspectRatio: string
    FrameRate_Mode: string
    FrameRate: string
    FrameRate_Num: string
    FrameRate_Den: string
    FrameCount: string
    ColorSpace: string
    ChromaSubsampling: string
    BitDepth: string
    Delay: string
    Delay_Source: string
    StreamSize: string
    Default: string
    Forced: string
}

/** MediaInfo Audio 轨道 */
export interface IMediaInfoAudioTrack {
    '@type': 'Audio'
    StreamOrder: string
    ID: string
    UniqueID: string
    Format: string
    Format_Settings_SBR: string
    Format_AdditionalFeatures: string
    CodecID: string
    Duration: string
    BitRate: string
    Channels: string
    ChannelPositions: string
    ChannelLayout: string
    SamplesPerFrame: string
    SamplingRate: string
    SamplingCount: string
    FrameRate: string
    FrameCount: string
    Compression_Mode: string
    Delay: string
    Delay_Source: string
    Video_Delay: string
    StreamSize: string
    Default: string
    Forced: string
    Language: string
}

/** MediaInfo Text 轨道 */
export interface IMediaInfoTextTrack {
    '@type': 'Text'
    StreamOrder: string
    ID: string
    UniqueID: string
    Format: string
    CodecID: string
    Duration: string
    BitRate: string
    FrameRate: string
    FrameCount: string
    ElementCount: string
    Compression_Mode: string
    StreamSize: string
    Language: string
    Default: string
    Forced: string
}

/** MediaInfo 轨道 */
export type IMediaInfoTrack =
    | IMediaInfoGeneralTrack
    | IMediaInfoVideoTrack
    | IMediaInfoAudioTrack
    | IMediaInfoTextTrack

/** MediaInfo 媒体信息 */
export interface IMediaInfoMedia {
    '@ref': string
    track: IMediaInfoTrack[]
}

/** MediaInfo JSON 结构 */
export interface IMediaInfo {
    creatingLibrary: IMediaInfoCreatingLibrary
    media: IMediaInfoMedia
}
