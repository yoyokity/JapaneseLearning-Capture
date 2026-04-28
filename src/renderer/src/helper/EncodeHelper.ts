import { Ipc } from '@renderer/ipc'

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
        const textarea = document.createElement('textarea')
        textarea.innerHTML = text
        return textarea.value
    }
}
