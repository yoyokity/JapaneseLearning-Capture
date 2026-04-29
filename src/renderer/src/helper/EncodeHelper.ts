import { Ipc } from '@renderer/ipc'
import stringSimilarity from 'string-similarity'

/** 编码相关 */
export class EncodeHelper {
    /**
     * URL 编码
     */
    static encodeUrl(value: string): string {
        return encodeURIComponent(value)
    }

    /**
     * 解码 EUC-JP 编码的 ArrayBuffer
     */
    static decodeEucJp(buffer: ArrayBuffer): string {
        return new TextDecoder('EUC-JP').decode(new Uint8Array(buffer))
    }

    /**
     * EUC-JP URL 编码
     */
    static async encodeUrlEucJp(value: string): Promise<string> {
        const bytes = await Ipc.net.encode(value, 'EUC-JP')
        return bytes.map((byte) => `%${byte.toString(16).toUpperCase().padStart(2, '0')}`).join('')
    }

    /**
     * 将文本中的转义换行符转为普通换行
     * @param text 原始文本
     */
    static normalizePlotLineBreak(text: string) {
        return text
            .replace(/\\r\\n/g, '\n')
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '\n')
            .replace(/\\/, '')
    }

    /**
     * 全角转半角
     */
    static fullToHalf(str: string) {
        return str
            .replace(/[\uFF01-\uFF5E]/g, (ch) =>
                String.fromCharCode(ch.charCodeAt(0) - Number('0xFEE0'))
            )
            .replace(/\u3000/g, ' ') // 全角空格单独处理
    }

    /**
     * 将 HTML 实体转为实际字符
     * @param text 原始文本
     */
    static decodeHtmlEntity(text: string) {
        if (!text) return ''
        const textarea = document.createElement('textarea')
        textarea.innerHTML = text
        if (!textarea.value) return ''
        return textarea.value
    }

    /**
     * 获取最佳匹配结果
     * @param target 目标文本
     * @param candidates 候选文本列表
     * @remarks 忽略字符全角半角的不同
     */
    static bestMatch(target: string, candidates: string[]) {
        if (candidates.length === 0) {
            return null
        }

        const normalizedTarget = EncodeHelper.fullToHalf(target)
        const normalizedCandidates = candidates.map((candidate) =>
            EncodeHelper.fullToHalf(candidate)
        )
        const bestMatch = stringSimilarity.findBestMatch(
            normalizedTarget,
            normalizedCandidates
        ).bestMatch
        if (bestMatch.rating < 0.5) {
            return null
        }

        const index = normalizedCandidates.indexOf(bestMatch.target)

        return index === -1 ? null : candidates[index]
    }

    /**
     * 将标点符号替换为空格
     */
    static punctuationsToSpace(str: string) {
        return str.replace(/[\p{P}\p{S}]/gu, ' ').trim()
    }
}
