import type { NumResponse } from '@renderer/plugins/AV/fanza.num.type'
import type { Actor } from '@renderer/scraper'

import { LogHelper } from '@renderer/helper'

export const scraperName = 'AV'

export interface IAvContext {
    num: {
        JavDB: string
        jable: string
        mgs: string
        fanza: string
    }
    webContent: {
        JavDB: string
        jable: string
        mgs: string
        fanza: NumResponse.PpvContent | null
    }
    originaltitle: string
    maker: string
    tag: string[]
    /**
     * 番号后缀，CU、UC、C、U
     */
    suffix: string
    actor: Actor[]
    image: {
        smallImgUrl: string
        bigImgUrl: string
    }
}

export const logger = LogHelper.title(scraperName)

export const loggerJavDB = LogHelper.title(scraperName).title('JavDB')

export const loggerJable = LogHelper.title(scraperName).title('Jable')

export const loggerMsg = LogHelper.title(scraperName).title('Mgs')

export const loggerFanza = LogHelper.title(scraperName).title('Fanza')
