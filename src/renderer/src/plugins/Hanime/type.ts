import { LogHelper } from '@renderer/helper'

export const scraperName = '里番'

export const loggerHanime1 = LogHelper.title(scraperName).title('Hanime1')

export const loggerGetchu = LogHelper.title(scraperName).title('Getchu')

export const loggerDlsite = LogHelper.title(scraperName).title('Dlsite')

export const loggerFanza = LogHelper.title(scraperName).title('Fanza')

/**
 * 用于对厂商进行翻译
 */
export const maker_trans = {
    ピンクパイナップル: 'pinkpineapple',
    'ばにぃうぉ〜か〜': 'lune-soft',
    'ばにぃうぉ～か～': 'lune-soft',
    あんてきぬすっ: 'lune-soft',
    'じゅうしぃまんご〜': 'lune-soft',
    ショーテン: 'showten',
    'メリー・ジェーン': 'mary-jane',
    'ZIZ [ジズ]': 'ZIZ'
}

export const bannedWord = ['催眠']
