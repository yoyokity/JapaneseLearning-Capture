import type { IVideoFile } from '@renderer/scraper'

export interface ISeriesCardItem {
    type: 'series'
    name: string
    coverVideo: IVideoFile
    files: IVideoFile[]
}

export interface IVideoCardItem {
    type: 'video'
    video: IVideoFile
}

export type ManageCardItem = ISeriesCardItem | IVideoCardItem
