import type { TextFileEncoding, TextFileLineEndings } from './textFile'

import { readFile, stat } from 'node:fs/promises'
import { tool } from 'ai'
import { z } from 'zod'

import { appPath } from '../../../globalStates'
import {
    assertInsideSandbox,
    decodeTextBuffer,
    detectLineEndings,
    getFilePathKey,
    normalizeLineEndings,
    resolveSandboxFilePath,
    SandboxPathError,
    UnsupportedTextFileError
} from './textFile'

/** 默认最多读取行数 */
export const READ_DEFAULT_MAX_LINES = 2000

/** 整文件读取大小上限 */
export const READ_MAX_FILE_SIZE_BYTES = 256 * 1024

/** 分段读取大小上限 */
const READ_RANGE_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024

/** 单次输出 token 上限 */
const READ_MAX_OUTPUT_TOKENS = 25_000

/** 粗略 token 估算除数 */
const ESTIMATED_TOKEN_CHAR_DIVISOR = 3

const TRAILING_ZERO_PATTERN = /\.0$/
const LINE_BREAK_PATTERN = /\r?\n/
const CHINESE_CHAR_PATTERN = /[\u4E00-\u9FFF]/g

export interface IReadFileState {
    /** 文件完整内容（LF） */
    content: string
    /** 原编码 */
    encoding: TextFileEncoding
    /** 原换行风格 */
    lineEndings: TextFileLineEndings
    /** 读取时修改时间 */
    mtimeMs: number
    /** 读取时文件大小 */
    sizeBytes: number
    /** 是否部分视图 */
    isPartialView: boolean
    /** 起始行号 */
    offset: number
    /** 读取行数 */
    limit?: number | undefined
}

export interface IReadFileToolOptions {
    /** 共享读取状态 */
    readFileState?: Map<string, IReadFileState> | undefined
}

export interface IReadFileInput {
    file_path: string
    offset?: number | undefined
    limit?: number | undefined
}

export interface IReadFileTextOutput {
    ok: true
    type: 'text'
    filePath: string
    content: string
    startLine: number
    numLines: number
    totalLines: number
    sizeBytes: number
    truncated: boolean
    partialView: boolean
    notice?: string | undefined
}

export interface IReadFileErrorOutput {
    ok: false
    errorCode: 'not_found' | 'not_file' | 'too_large' | 'unsupported' | 'invalid_path' | 'io_error'
    message: string
}

export type ReadFileOutput = IReadFileTextOutput | IReadFileErrorOutput

/** 创建读取文件工具 */
export function createReadFileTool(options: IReadFileToolOptions = {}) {
    const sandboxDir = appPath.sandbox
    const readFileState = options.readFileState ?? new Map<string, IReadFileState>()

    return tool<IReadFileInput, ReadFileOutput, Record<string, unknown>>({
        description: [
            'Reads a file from the agent sandbox.',
            '',
            '- `file_path` is a file name inside the sandbox, not a path. Do not pass directories, absolute paths, or `..`.',
            `- Reads up to ${READ_DEFAULT_MAX_LINES} lines by default.`,
            '- When you already know which part of the file you need, only read that part. This can be important for larger files.',
            '- Results are returned using cat -n format, with line numbers starting at 1.',
            '- Reading a directory, a missing file, or an empty file returns an error or system reminder rather than content.',
            '- Do NOT re-read a file you just edited to verify — edit_file would have errored if the change failed.'
        ].join('\n'),
        inputSchema: z.object({
            file_path: z.string().describe('The file name inside the sandbox, not a path'),
            offset: z
                .number()
                .int()
                .nonnegative()
                .optional()
                .describe(
                    'The line number to start reading from. Only provide if the file is too large to read at once'
                ),
            limit: z
                .number()
                .int()
                .positive()
                .optional()
                .describe(
                    'The number of lines to read. Only provide if the file is too large to read at once.'
                )
        }),
        execute: async ({ file_path, offset, limit }): Promise<ReadFileOutput> => {
            try {
                const filePath = resolveSandboxFilePath(file_path, sandboxDir)
                const stats = await stat(filePath)
                if (!stats.isFile()) {
                    return errorOutput('not_file', `Path is not a regular file: ${file_path}`)
                }
                await assertInsideSandbox(filePath, sandboxDir)

                const wholeFileRead = offset === undefined && limit === undefined
                const maxBytes = wholeFileRead
                    ? READ_MAX_FILE_SIZE_BYTES
                    : READ_RANGE_MAX_FILE_SIZE_BYTES
                if (stats.size > maxBytes) {
                    return errorOutput(
                        'too_large',
                        `File content (${formatFileSize(stats.size)}) exceeds maximum allowed size (${formatFileSize(maxBytes)}). Use offset and limit parameters to read specific portions of the file.`
                    )
                }

                const buffer = await readFile(filePath)
                const decoded = decodeTextBuffer(buffer, filePath)
                const fullContent = normalizeLineEndings(decoded.content)
                const lines = fullContent.length === 0 ? [] : fullContent.split('\n')
                const offsetLine = offset === undefined || offset <= 1 ? 0 : offset - 1
                const selectedLines = lines.slice(
                    offsetLine,
                    offsetLine + (limit ?? READ_DEFAULT_MAX_LINES)
                )
                const selectedContent = selectedLines.join('\n')
                const startLine = offsetLine + 1
                const totalLines = lines.length
                const tokenCount = estimateTokens(selectedContent)

                let content = selectedContent
                let numLines = selectedLines.length
                let notice: string | undefined
                let partialView = false

                if (tokenCount > READ_MAX_OUTPUT_TOKENS) {
                    const capped = capContentByTokens({
                        lines: selectedLines,
                        startLine,
                        totalLines,
                        filePath,
                        tokenCount
                    })
                    content = capped.content
                    numLines = capped.numLines
                    notice = capped.notice
                    partialView = true
                }

                readFileState.set(getFilePathKey(filePath), {
                    content: fullContent,
                    encoding: decoded.encoding,
                    lineEndings: detectLineEndings(decoded.content),
                    mtimeMs: stats.mtimeMs,
                    sizeBytes: stats.size,
                    isPartialView: partialView,
                    offset: startLine,
                    limit
                })

                return {
                    ok: true as const,
                    type: 'text' as const,
                    filePath,
                    content,
                    startLine,
                    numLines,
                    totalLines,
                    sizeBytes: stats.size,
                    truncated: partialView || offsetLine + selectedLines.length < totalLines,
                    partialView,
                    notice
                }
            } catch (error) {
                if (error instanceof SandboxPathError) {
                    return errorOutput('invalid_path', error.message)
                }
                if (error instanceof UnsupportedTextFileError) {
                    return errorOutput('unsupported', error.message)
                }
                if (isNodeError(error) && error.code === 'ENOENT') {
                    return errorOutput('not_found', `File not found in sandbox: ${file_path}`)
                }

                return errorOutput(
                    'io_error',
                    error instanceof Error ? error.message : String(error)
                )
            }
        },
        toModelOutput: ({ output }) => ({
            type: 'text' as const,
            value: formatReadFileModelContent(output)
        })
    })
}

/** 生成模型可见结果 */
export function formatReadFileModelContent(output: ReadFileOutput) {
    if (!output.ok) return `<tool_use_error>${output.message}</tool_use_error>`

    const prefix = output.notice ? `<system-reminder>${output.notice}</system-reminder>\n\n` : ''

    if (output.content.length === 0) {
        if (output.numLines >= 1 && output.totalLines > 1) {
            return `${prefix}${addReadLineNumbers('', output.startLine)}`
        }

        const warning =
            output.numLines >= 1 || output.totalLines === 0
                ? 'Warning: the file exists but the contents are empty.'
                : `Warning: the file exists but is shorter than the provided offset (${output.startLine}). The file has ${output.totalLines} lines.`

        return `${prefix}<system-reminder>${warning}</system-reminder>`
    }

    return `${prefix}${addReadLineNumbers(output.content, output.startLine)}`
}

/** 给文本加行号 */
export function addReadLineNumbers(content: string, startLine: number) {
    return content
        .split(LINE_BREAK_PATTERN)
        .map((line, index) => `${index + startLine}\t${line}`)
        .join('\n')
}

function errorOutput(
    errorCode: IReadFileErrorOutput['errorCode'],
    message: string
): IReadFileErrorOutput {
    return { ok: false, errorCode, message }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && 'code' in error
}

function formatFileSize(bytes: number) {
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1).replace(TRAILING_ZERO_PATTERN, '')}KB`
    return `${(bytes / 1024 / 1024).toFixed(1).replace(TRAILING_ZERO_PATTERN, '')}MB`
}

function estimateTokens(text: string) {
    const chineseChars = text.match(CHINESE_CHAR_PATTERN)?.length ?? 0
    return Math.ceil((chineseChars * 2 + text.length - chineseChars) / ESTIMATED_TOKEN_CHAR_DIVISOR)
}

function capContentByTokens(input: {
    lines: string[]
    startLine: number
    totalLines: number
    filePath: string
    tokenCount: number
}) {
    const { lines, startLine, totalLines, filePath, tokenCount } = input
    let content = ''
    let numLines = 0

    for (const line of lines) {
        const candidate = numLines === 0 ? line : `${content}\n${line}`
        if (estimateTokens(candidate) > READ_MAX_OUTPUT_TOKENS) break
        content = candidate
        numLines++
    }

    if (numLines > 0) {
        const lastLine = startLine + numLines - 1
        return {
            content,
            numLines,
            notice: `[Truncated: PARTIAL view — ${filePath}: showing lines ${startLine}-${lastLine} of ${totalLines} total (${tokenCount} tokens, cap ${READ_MAX_OUTPUT_TOKENS}). Call Read with offset=${lastLine + 1} limit=${numLines} for the next page. Do NOT answer from this page alone if the answer may be further in the file.]`
        }
    }

    const firstLine = lines[0] ?? ''
    let end = Math.min(firstLine.length, READ_MAX_OUTPUT_TOKENS * ESTIMATED_TOKEN_CHAR_DIVISOR)
    while (end > 0 && estimateTokens(firstLine.slice(0, end)) > READ_MAX_OUTPUT_TOKENS) {
        end -= Math.max(1, Math.ceil(end / 10))
    }

    return {
        content: firstLine.slice(0, end),
        numLines: 1,
        notice: `[Truncated: PARTIAL view — ${filePath}: showing the first ${end} of ${firstLine.length} characters (${tokenCount} tokens, cap ${READ_MAX_OUTPUT_TOKENS}). Use Read with offset/limit to page through it. Do NOT answer from this excerpt alone if the answer may be elsewhere in the file.]`
    }
}
