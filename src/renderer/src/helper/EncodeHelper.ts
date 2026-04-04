import iconv from 'iconv-lite'

export class EncodeHelper {
    /**
     * 解码 EUC-JP 编码的 ArrayBuffer
     */
    static decodeEucJp(buffer: ArrayBuffer): string {
        return new TextDecoder('EUC-JP').decode(new Uint8Array(buffer))
    }

    /**
     * EUC-JP 编码
     */
    static encodeEucJp(value: string): string {
        const buffer = iconv.encode(value, 'EUC-JP')
        return Array.from(buffer)
            .map((byte) => `%${byte.toString(16).toUpperCase().padStart(2, '0')}`)
            .join('')
    }
}
