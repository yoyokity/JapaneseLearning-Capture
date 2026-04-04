import { Ipc } from '@renderer/ipc'

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
}
