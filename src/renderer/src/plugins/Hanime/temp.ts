import { LogHelper } from '@renderer/helper'

export const scraperName = '里番'

export interface IHanimeContext {
    封面: string | null
    超分封面: string | null
    num: {
        hanime1: string
        getchu: string
        dlsite: string
    }
    webContent: {
        hanime1: string
        getchu: string
        dlsite: string
    }
    originaltitle: string
    maker: string
    tag: string[]
}

export const loggerDlsite = LogHelper.title(scraperName).title('Dlsite')

export const loggerGetchu = LogHelper.title(scraperName).title('Getchu')

export const loggerHanime1 = LogHelper.title(scraperName).title('Hanime1')
