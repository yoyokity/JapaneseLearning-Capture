import { Buffer } from 'node:buffer'
import { realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import iconv from 'iconv-lite'

/** 文本文件编码 */
export type TextFileEncoding = 'utf8' | 'utf16le' | 'gb2312' | 'gbk' | 'gb18030'

/** 文本文件换行符 */
export type TextFileLineEndings = 'LF' | 'CRLF'

const UTF8_BOM = [239, 187, 191] as const
const UTF16LE_BOM = [255, 254] as const
const LEGACY_CHINESE_ENCODINGS = ['gb2312', 'gbk', 'gb18030'] as const
const BINARY_CONTROL_BYTE_THRESHOLD = 0.3
const MAX_DETECTION_TRAILING_DROP_BYTES = 3
const SANDBOX_SEPARATOR_PATTERN = /[\\/]/
const INVALID_FILENAME_PATTERN = /[\0:*?"<>|]/
const TRAILING_DOT_OR_SPACE_PATTERN = /[. ]$/

/** 不支持的文本编码或二进制文件 */
export class UnsupportedTextFileError extends Error {
    constructor(filePath: string) {
        super(`Unsupported or binary text encoding: ${filePath}`)
        this.name = 'UnsupportedTextFileError'
    }
}

/** 沙箱路径非法 */
export class SandboxPathError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'SandboxPathError'
    }
}

/**
 * 解码文本文件
 * @param buffer 文件内容
 * @param filePath 文件路径
 * @remark 自动识别 UTF-8、UTF-16LE 和常见中文编码
 */
export function decodeTextBuffer(buffer: Buffer, filePath: string) {
    const encoding = detectTextEncoding(buffer, filePath)
    const content = isLegacyChineseEncoding(encoding)
        ? iconv.decode(buffer, encoding)
        : buffer.toString(encoding)

    return { content, encoding }
}

/**
 * 按原编码写入文本
 * @param content 逻辑文本（LF）
 * @param encoding 原编码
 * @param filePath 文件路径
 * @remark 无法用原编码表示时抛错，避免有损写回
 */
export function encodeTextContent(content: string, encoding: TextFileEncoding, filePath: string) {
    if (!isLegacyChineseEncoding(encoding)) return Buffer.from(content, encoding)

    const encoded = iconv.encode(content, encoding)
    if (iconv.decode(encoded, encoding) !== content) {
        throw new Error(`Content cannot be encoded as ${encoding}: ${filePath}`)
    }

    return encoded
}

/** 统一为 LF 逻辑文本 */
export function normalizeLineEndings(content: string) {
    return content.replaceAll('\r\n', '\n')
}

/** 按原换行风格写回 */
export function applyLineEndings(content: string, lineEndings: TextFileLineEndings) {
    return lineEndings === 'CRLF' ? content.replaceAll('\n', '\r\n') : content
}

/** 统计换行符风格 */
export function detectLineEndings(content: string): TextFileLineEndings {
    let crlfCount = 0
    let lfCount = 0

    for (let index = 0; index < content.length; index++) {
        if (content[index] !== '\n') continue
        if (index > 0 && content[index - 1] === '\r') crlfCount++
        else lfCount++
    }

    return crlfCount > lfCount ? 'CRLF' : 'LF'
}

/**
 * 解析沙箱内的文件名
 * @param fileName 模型传入的文件名
 * @param sandboxDir 沙箱目录
 * @remark 只接受单个文件名，不接受目录、绝对路径或路径穿越
 */
export function resolveSandboxFilePath(fileName: string, sandboxDir: string) {
    if (!fileName || fileName !== fileName.trim()) {
        throw new SandboxPathError('file_path must be a non-empty file name.')
    }
    if (
        SANDBOX_SEPARATOR_PATTERN.test(fileName) ||
        fileName === '.' ||
        fileName === '..' ||
        INVALID_FILENAME_PATTERN.test(fileName) ||
        TRAILING_DOT_OR_SPACE_PATTERN.test(fileName)
    ) {
        throw new SandboxPathError(
            `file_path must be a file name inside the sandbox, not a path: ${fileName}`
        )
    }

    return join(resolve(sandboxDir), fileName)
}

/**
 * 校验真实路径仍在沙箱内
 * @param filePath 文件路径
 * @param sandboxDir 沙箱目录
 * @remark 防止沙箱内的符号链接指向外部
 */
export async function assertInsideSandbox(filePath: string, sandboxDir: string) {
    const [realFile, realRoot] = await Promise.all([realpath(filePath), realpath(sandboxDir)])
    const rel = relative(realRoot, realFile)

    if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) return
    throw new SandboxPathError(`Path is outside the sandbox: ${filePath}`)
}

/** 生成读取状态 Map 的路径键 */
export function getFilePathKey(filePath: string) {
    const normalized = resolve(filePath)
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function detectTextEncoding(buffer: Buffer, filePath: string): TextFileEncoding {
    if (hasPrefix(buffer, UTF8_BOM)) return 'utf8'
    if (hasPrefix(buffer, UTF16LE_BOM)) return 'utf16le'
    if (looksLikeBinary(buffer)) throw new UnsupportedTextFileError(filePath)
    if (isValidUtf8(buffer)) return 'utf8'

    for (const encoding of LEGACY_CHINESE_ENCODINGS) {
        if (roundTripsWithOptionalTrailingDrop(buffer, encoding)) return encoding
    }

    throw new UnsupportedTextFileError(filePath)
}

function isLegacyChineseEncoding(
    encoding: TextFileEncoding
): encoding is (typeof LEGACY_CHINESE_ENCODINGS)[number] {
    return LEGACY_CHINESE_ENCODINGS.includes(encoding as (typeof LEGACY_CHINESE_ENCODINGS)[number])
}

function hasPrefix(buffer: Buffer, prefix: readonly number[]) {
    return prefix.every((byte, index) => buffer[index] === byte)
}

function isValidUtf8(buffer: Buffer) {
    try {
        new TextDecoder('utf-8', { fatal: true }).decode(buffer)
        return true
    } catch {
        return false
    }
}

function looksLikeBinary(buffer: Buffer) {
    if (buffer.length === 0) return false

    let controlBytes = 0
    for (const byte of buffer) {
        if (byte === 0) return true
        if (byte < 9 || (byte > 13 && byte < 32)) controlBytes++
    }

    return controlBytes / buffer.length > BINARY_CONTROL_BYTE_THRESHOLD
}

function roundTripsWithOptionalTrailingDrop(
    buffer: Buffer,
    encoding: (typeof LEGACY_CHINESE_ENCODINGS)[number]
) {
    if (buffer.length === 0) return true

    for (let drop = 0; drop <= Math.min(MAX_DETECTION_TRAILING_DROP_BYTES, buffer.length); drop++) {
        const candidate = drop === 0 ? buffer : buffer.subarray(0, buffer.length - drop)
        if (candidate.length === 0) continue

        const encoded = iconv.encode(iconv.decode(candidate, encoding), encoding)
        if (encoded.equals(candidate)) return true
    }

    return false
}
