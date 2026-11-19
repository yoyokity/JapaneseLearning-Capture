import type { IActor } from '@renderer/scraper'

import {
    AgentHelper,
    DataHelper,
    getAgentConfig,
    LogHelper,
    NetHelper,
    StringHelper
} from '@renderer/helper'
import { settingsStore } from '@renderer/stores'
import { isAgentSuccess } from '@shared'
import { load as cheerioLoad } from 'cheerio'

const avfanUrl = 'https://avfan.mixh.jp'

const avfanRequestOptions = {
    headers: {
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Referer: `${avfanUrl}/archives/top/`,
        Origin: avfanUrl
    }
}

// avfan 反爬验证页特征
const avfanChallengeText = 'Loader'

const DATA_NAME = '#actor-data'
// 数据版本，递增即失效
const DATA_VERSION = 3

// 启动时清理旧版本数据
void DataHelper.deleteStores(DATA_NAME, `${DATA_NAME}-${DATA_VERSION}`)

// 匹配 background-image 中的图片链接
const backgroundImageRegex = /url\((?<url>[^)]+)\)/

// AI 配置缺失只提示一次
let aiConfigWarned = false

/** 演员信息查询系统提示词 */
const ACTOR_SYSTEM_PROMPT = `你是日本成人影视演员资料查询助手，根据用户提供的姓名和性别用联网工具查询演员资料。
要求：
1. 最多调用 2 次 web_search。
2. 获得身高、三围、罩杯、出生日期、出道时间后立即返回 JSON。
3. 只返回一个 JSON 对象，不要返回 Markdown 代码块或其他内容：
{
  "height": "身高，如 168cm",
  "bwh": "三围，格式 xx-xx-xx，如 90-58-90",
  "cup": "罩杯，如 F",
  "born": "出生日期，如 1995-01-01",
  "debut": "出道时间，如 2015"
}
4. 查不到的字段返回空字符串，不要编造。
5. 存在同名演员时，选择与性别相符、最知名的一位。`

export interface IActorFull extends IActor {
    /**
     * 性别
     */
    gender: 'male' | 'female'
    /**
     * 身高，如 168cm
     */
    height?: string
    /**
     * 三围，如 90-58-90
     */
    bwh?: string
    /**
     * 罩杯，如 F
     */
    cup?: string
    /**
     * 出生日期
     */
    born?: string
    /**
     * 出道时间
     */
    debut?: string
}

/**
 * 从 AI 返回的文本中解析演员信息
 * @param text AI 返回的文本
 */
function parseActorInfo(text: string) {
    const json = text.match(/```(?:json)?(?<json>[\s\S]*?)```/)?.groups?.json ?? text
    const start = json.indexOf('{')
    const end = json.lastIndexOf('}')
    if (start === -1 || end <= start) return null

    try {
        return JSON.parse(json.slice(start, end + 1)) as Record<string, unknown>
    } catch {
        return null
    }
}

/**
 * 转为去空格的字符串
 */
function toText(value: unknown) {
    if (typeof value === 'string') return value.replace(/\s+/g, '')
    if (typeof value === 'number') return String(value)
    return ''
}

/**
 * 格式化身高
 */
function formatHeight(value: unknown) {
    const text = toText(value)
    if (!text) return ''
    return /^\d+(?:\.\d+)?$/.test(text) ? `${text}cm` : text
}

/**
 * 演员
 */
export class Actor implements IActorFull {
    name: string
    imgUrl: string = ''
    role: string = ''
    gender: 'male' | 'female' = 'female'
    height?: string
    bwh?: string
    cup?: string
    born?: string
    debut?: string

    constructor(name: string, gender: 'male' | 'female') {
        this.name = name
        this.gender = gender
    }

    /**
     * 通过 agent 查询演员信息
     */
    private async searchAgent(signal: AbortSignal): Promise<boolean> {
        const settings = settingsStore()
        const config = getAgentConfig(settings.ai)
        if (!config) {
            if (!aiConfigWarned) {
                aiConfigWarned = true
                LogHelper.warn('未配置 AI 模型，无法获取演员信息')
            }
            return false
        }

        const result = await AgentHelper.ask({
            config,
            system: ACTOR_SYSTEM_PROMPT,
            prompt: `姓名：${this.name}\n性别：${this.gender === 'female' ? '女' : '男'}`,
            source: 'actor',
            search: true,
            signal
        })

        if (result.cancelled || !isAgentSuccess(result.finishReason)) {
            LogHelper.warn(`演员信息查询未正常结束：${this.name}`, {
                cancelled: result.cancelled,
                finishReason: result.finishReason,
                text: result.text
            })
            return false
        }

        const data = parseActorInfo(result.text)
        if (!data) {
            LogHelper.warn(`演员信息解析失败：${this.name}`, result.text)
            return false
        }

        this.height = formatHeight(data.height) || this.height
        this.bwh = toText(data.bwh).replace(/cm$/i, '') || this.bwh
        this.cup = toText(data.cup).toUpperCase() || this.cup
        this.born = toText(data.born) || this.born
        this.debut = toText(data.debut) || this.debut

        return true
    }

    /**
     * 在 avfan 中获取演员头像
     */
    private async searchAvfan(signal: AbortSignal): Promise<boolean> {
        try {
            // 搜索演员
            const formData = new URLSearchParams()
            formData.append('search', this.name)
            formData.append('sno', '0')

            const postSearch = () =>
                NetHelper.post(`${avfanUrl}/archives/top/search.php`, formData.toString(), {
                    signal,
                    ...avfanRequestOptions
                })

            let searchResponse = await postSearch()

            // 遇到反爬验证时，打开验证窗口获取 cookie 后重试
            if (searchResponse.body.includes(avfanChallengeText)) {
                const verify = await NetHelper.verify(`${avfanUrl}/archives/top/search.php`, [
                    'wssplashchk'
                ])

                if (!verify.success) {
                    LogHelper.warn(`avfan 验证失败：${this.name}`, verify.error)
                    return false
                }

                searchResponse = await postSearch()
            }

            if (!searchResponse.ok) {
                LogHelper.warn(`avfan 搜索失败（${searchResponse.status}）：${this.name}`)
                return false
            }

            let $ = cheerioLoad(searchResponse.body)
            const actors = $('a.girls')
                .toArray()
                .flatMap((el) => {
                    const item = $(el)
                    const href = item.attr('href')?.trim()
                    const name = item.find('.a_name').text().trim()
                    if (!href || !name) return []

                    const style = item.find('.search_card').attr('style') || ''
                    const imgUrl =
                        StringHelper.decodeHtmlEntity(style)
                            .match(backgroundImageRegex)
                            ?.groups?.url?.trim() || ''

                    return [{ href, name, imgUrl }]
                })

            // 优先同名，其次第一个有头像的，最后兜底第一个
            const actor =
                actors.find((item) => item.name === this.name) ??
                actors.find((item) => item.imgUrl && !item.imgUrl.includes('noimg.jpg')) ??
                actors[0]

            if (!actor) {
                LogHelper.warn(`avfan 未找到演员：${this.name}`)
                return false
            }

            // 转到演员页面
            const actorResponse = await NetHelper.get(actor.href, { signal })
            if (!actorResponse.ok) {
                LogHelper.warn(`avfan 演员页请求失败（${actorResponse.status}）：${this.name}`)
                return false
            }

            // 获取演员头像
            $ = cheerioLoad(actorResponse.body)
            const imgUrl = $('header img#timg').attr('src')?.trim()
            const actorImgUrl = imgUrl ? StringHelper.decodeHtmlEntity(imgUrl) : actor.imgUrl
            this.imgUrl = actorImgUrl && !actorImgUrl.includes('noimg.jpg') ? actorImgUrl : ''

            if (!this.imgUrl) {
                LogHelper.warn(`avfan 未找到头像：${this.name}`)
                return false
            }

            return true
        } catch (error) {
            LogHelper.warn(`avfan 获取头像失败：${this.name}`, error)
            return false
        }
    }

    /**
     * 搜索演员信息，数据库中存在则直接拿取 (注意是异步函数)
     * @param {AbortSignal} signal 取消信号
     */
    async search(signal: AbortSignal): Promise<void> {
        // AI 资料完整时不再请求；头像缺失时仍会重试 avfan
        const agentComplete = await this.get()
        if (agentComplete && this.imgUrl) return

        // AI 资料不完整时查询 agent，头像缺失时查询 avfan
        const [agentOk] = await Promise.all([
            agentComplete ? true : this.searchAgent(signal),
            this.imgUrl ? true : this.searchAvfan(signal)
        ])

        // AI 资料齐全时缓存，imgUrl 缺失不影响缓存
        if (agentOk && this.hasAgentInfo()) await this.set()
    }

    /**
     * 判断 AI 资料是否完整（用于缓存）
     */
    private hasAgentInfo() {
        return Boolean(this.height && this.bwh && this.cup && this.born && this.debut)
    }

    /**
     * 将演员信息转换为字符串
     */
    toString() {
        const measurements = [this.height, this.bwh].filter(Boolean).join(' ')
        const body = [measurements, this.cup ? `(${this.cup})` : ''].filter(Boolean).join(' ')

        if (body || this.born || this.debut) {
            let text = `${this.name}${this.born ? ` (${this.born})` : ''}\n\n`
            if (body) text += `- 身高三围: ${body}\n\n`
            if (this.debut) text += `- 出道时间: ${this.debut}`

            return `\n\n----------------\n\n${text}`
        }

        return ''
    }

    /**
     * 从数据库中获取演员信息
     */
    private async get(): Promise<boolean> {
        const data = await DataHelper.get<IActorFull>(`${DATA_NAME}-${DATA_VERSION}`, this.name)
        if (!data) return false

        this.imgUrl = data.imgUrl || ''
        this.role = data.role || ''
        this.gender = data.gender || 'female'
        this.height = data.height || undefined
        this.bwh = data.bwh || undefined
        this.cup = data.cup || undefined
        this.born = data.born || undefined
        this.debut = data.debut || undefined

        // 资料不完整时重新获取
        return this.hasAgentInfo()
    }

    /**
     * 将演员信息存入数据库中
     */
    private async set() {
        const data: IActorFull = {
            name: this.name,
            imgUrl: this.imgUrl,
            role: this.role,
            gender: this.gender,
            height: this.height,
            bwh: this.bwh,
            cup: this.cup,
            born: this.born,
            debut: this.debut
        }
        await DataHelper.set(`${DATA_NAME}-${DATA_VERSION}`, this.name, data)
    }
}
