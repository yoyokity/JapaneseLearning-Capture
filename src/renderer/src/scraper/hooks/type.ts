import type { LogHelper } from '@renderer/helper'
import type { IScraperVideoFuncs, Scraper } from '@renderer/scraper/Scraper'

export type ScraperFuncName = keyof IScraperVideoFuncs

export interface IScraperContext {
    logger: ReturnType<typeof LogHelper.title>
    scraper: NonNullable<ReturnType<typeof Scraper.getScraperInstance>>
}

/**
 * 刮削状态
 */
export type ScraperState = 'error' | 'warn' | 'success'

/** 需要执行的解析函数列表 */
export const parseFuncs: { name: ScraperFuncName; label: string }[] = [
    { name: 'parseTitle', label: '标题' },
    { name: 'parseOriginaltitle', label: '原标题' },
    { name: 'parseSorttitle', label: '排序标题' },
    { name: 'parseTagline', label: '宣传词' },
    { name: 'parseNum', label: '编号' },
    { name: 'parseMpaa', label: '分级' },
    { name: 'parseRating', label: '评分' },
    { name: 'parseDirector', label: '导演' },
    { name: 'parseActor', label: '演员' },
    { name: 'parseStudio', label: '发行商' },
    { name: 'parseMaker', label: '制片商' },
    { name: 'parseSet', label: '影片系列' },
    { name: 'parseTag', label: '标签' },
    { name: 'parseGenre', label: '类型' },
    { name: 'parsePlot', label: '简介' },
    { name: 'parseYear', label: '发行年份' },
    { name: 'parsePremiered', label: '首映日期' },
    { name: 'parseReleasedate', label: '上映日期' },
    { name: 'parsePoster', label: '封面' },
    { name: 'parseThumb', label: '缩略图' },
    { name: 'parseFanart', label: '背景图' },
    { name: 'parseExtrafanart', label: '额外背景图' }
] as const
