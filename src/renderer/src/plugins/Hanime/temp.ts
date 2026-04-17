import { LogHelper } from '@renderer/helper'

export const scraperName = '里番'

export const temp = {
    封面: null as string | null,
    超分封面: null as string | null,
    num: {
        hanime1: '',
        getchu: '',
        dlsite: ''
    },
    webContent: {
        hanime1: '',
        getchu: '',
        dlsite: ''
    },
    originaltitle: '',
    maker: '',
    tag: [] as string[]
}

export const loggerDlsite = LogHelper.title(scraperName).title('Dlsite')

export const loggerGetchu = LogHelper.title(scraperName).title('Getchu')

export const loggerHanime1 = LogHelper.title(scraperName).title('Hanime1')
