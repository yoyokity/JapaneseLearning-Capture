import type { Stats } from 'node:fs'
import type { IReadFileState } from './readFile'
import type { TextFileEncoding, TextFileLineEndings } from './textFile'

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { tool } from 'ai'
import { z } from 'zod'

import { appPath } from '../../globalStates'
import { findEditMatch, normalizeReplacementForMatch, preserveQuoteStyle } from './editMatchers'
import { READ_DEFAULT_MAX_LINES } from './readFile'
import {
    applyLineEndings,
    assertInsideSandbox,
    decodeTextBuffer,
    detectLineEndings,
    encodeTextContent,
    getFilePathKey,
    normalizeLineEndings,
    resolveSandboxFilePath,
    SandboxPathError,
    UnsupportedTextFileError
} from './textFile'

/** 可编辑文件大小上限 */
export const EDIT_MAX_FILE_SIZE_BYTES = 1024 * 1024 * 1024

/** 编辑错误码 */
export const EditErrorCode = {
    NO_CHANGE: 1,
    FILE_EXISTS_NO_OLD_STRING: 3,
    FILE_NOT_EXIST: 4,
    NOTEBOOK_FILE: 5,
    FILE_NOT_READ: 6,
    STALE_FILE: 7,
    OLD_STRING_NOT_FOUND: 8,
    AMBIGUOUS_REPLACE: 9,
    FILE_TOO_LARGE: 10,
    INVALID_PATH: 13
} as const

export type EditErrorCodeValue = (typeof EditErrorCode)[keyof typeof EditErrorCode]

export interface IStructuredPatchHunk {
    oldStart: number
    oldLines: number
    newStart: number
    newLines: number
    lines: string[]
}

export interface IEditFileToolOptions {
    /** 共享读取状态 */
    readFileState?: Map<string, IReadFileState> | undefined
}

export interface IEditFileInput {
    file_path: string
    old_string: string
    new_string: string
    replace_all: boolean
}

export interface IEditFileSuccessOutput {
    ok: true
    filePath: string
    oldString: string
    newString: string
    originalFile: string
    structuredPatch: IStructuredPatchHunk[]
    replaceAll: boolean
    userModified: false
}

export interface IEditFileErrorOutput {
    ok: false
    errorCode: EditErrorCodeValue | 'io_error' | 'unsupported'
    message: string
}

export type EditFileOutput = IEditFileSuccessOutput | IEditFileErrorOutput

/** 创建编辑文件工具 */
export function createEditFileTool(options: IEditFileToolOptions = {}) {
    const sandboxDir = appPath.sandbox
    const readFileState = options.readFileState ?? new Map<string, IReadFileState>()

    return tool<IEditFileInput, EditFileOutput, Record<string, unknown>>({
        description: [
            '在 agent 沙箱中的文件内执行精确字符串替换。',
            '',
            '- `file_path` 是沙箱内的文件名，不是路径。不要传入目录、绝对路径或 `..`。',
            '- 编辑前必须在当前对话中读取过该文件，否则调用会失败。',
            '- `old_string` 必须与文件内容完全一致（包括缩进）且唯一，否则编辑失败。匹配前请去掉 Read 输出的行前缀（行号 + 制表符）。',
            '- `replace_all: true` 会替换所有匹配项。',
            `- 创建新文件时，传入空的 \`old_string\` 和完整内容作为 \`new_string\`。默认最多读取 ${READ_DEFAULT_MAX_LINES} 行。`
        ].join('\n'),
        inputSchema: z.object({
            file_path: z.string().describe('沙箱内的文件名，不是路径'),
            old_string: z.string().describe('要替换的文本'),
            new_string: z.string().describe('替换后的文本（必须与 old_string 不同）'),
            replace_all: z
                .boolean()
                .optional()
                .default(false)
                .describe('替换 old_string 的所有匹配项（默认 false）')
        }),
        execute: async ({
            file_path,
            old_string,
            new_string,
            replace_all
        }): Promise<EditFileOutput> => {
            try {
                const filePath = resolveSandboxFilePath(file_path, sandboxDir)
                const oldString = normalizeLineEndings(old_string)
                const newString = normalizeLineEndings(new_string)

                if (oldString === newString) {
                    return errorOutput(
                        EditErrorCode.NO_CHANGE,
                        'No changes to make: old_string and new_string are exactly the same.'
                    )
                }

                const key = getFilePathKey(filePath)
                const stats = await stat(filePath).catch((error) => {
                    if (!isNodeError(error) || error.code !== 'ENOENT') throw error
                    return undefined
                })

                if (!stats) {
                    if (oldString !== '') {
                        return errorOutput(
                            EditErrorCode.FILE_NOT_EXIST,
                            `File does not exist: ${filePath}`
                        )
                    }

                    await mkdir(sandboxDir, { recursive: true })
                    await writeFile(filePath, encodeTextContent(newString, 'utf8', filePath))
                    const created = await stat(filePath)
                    readFileState.set(key, {
                        content: newString,
                        encoding: 'utf8',
                        lineEndings: 'LF',
                        mtimeMs: created.mtimeMs,
                        sizeBytes: created.size,
                        isPartialView: false,
                        offset: 1
                    })

                    return {
                        ok: true as const,
                        filePath,
                        oldString: '',
                        newString,
                        originalFile: '',
                        structuredPatch: [],
                        replaceAll: replace_all,
                        userModified: false as const
                    }
                }

                if (!stats.isFile()) {
                    return errorOutput(
                        EditErrorCode.FILE_NOT_EXIST,
                        `Path is not a regular file: ${filePath}`
                    )
                }
                await assertInsideSandbox(filePath, sandboxDir)

                if (filePath.toLowerCase().endsWith('.ipynb')) {
                    return errorOutput(
                        EditErrorCode.NOTEBOOK_FILE,
                        'File is a Jupyter Notebook. Use the NotebookEdit to edit this file.'
                    )
                }

                if (stats.size > EDIT_MAX_FILE_SIZE_BYTES) {
                    return errorOutput(
                        EditErrorCode.FILE_TOO_LARGE,
                        'File is too large to edit (1GB). Maximum editable file size is 1GB.'
                    )
                }

                const state = readFileState.get(key)
                if (!state || state.isPartialView) {
                    return errorOutput(
                        EditErrorCode.FILE_NOT_READ,
                        'File has not been read yet. Read it first before writing to it.'
                    )
                }

                const buffer = await readFile(filePath)
                const decoded = decodeTextBuffer(buffer, filePath)
                const currentContent = normalizeLineEndings(decoded.content)

                if (state.mtimeMs !== stats.mtimeMs || state.sizeBytes !== stats.size) {
                    if (currentContent !== state.content) {
                        return errorOutput(
                            EditErrorCode.STALE_FILE,
                            'File has been modified since read, either by the user or by a linter. Read it again before attempting to write it.'
                        )
                    }

                    state.mtimeMs = stats.mtimeMs
                    state.sizeBytes = stats.size
                }

                if (oldString === '') {
                    if (currentContent.trim() !== '') {
                        return errorOutput(
                            EditErrorCode.FILE_EXISTS_NO_OLD_STRING,
                            'Cannot create new file - file already exists.'
                        )
                    }

                    return writeEditResult({
                        filePath,
                        key,
                        readFileState,
                        originalFile: currentContent,
                        oldString: '',
                        newString,
                        newContent: newString,
                        encoding: decoded.encoding,
                        lineEndings: detectLineEndings(decoded.content),
                        replaceAll: replace_all,
                        stats
                    })
                }

                const match = findEditMatch({
                    content: currentContent,
                    search: oldString,
                    replaceAll: replace_all
                })

                if (match.status === 'not_found') {
                    return errorOutput(
                        EditErrorCode.OLD_STRING_NOT_FOUND,
                        `String to replace not found in file.\nString: ${oldString}`
                    )
                }

                if (match.status === 'ambiguous') {
                    return errorOutput(
                        EditErrorCode.AMBIGUOUS_REPLACE,
                        createAmbiguousEditMessage(match.candidateCount, oldString)
                    )
                }

                const matchCount = countOccurrences(currentContent, match.actualString)
                if (!replace_all && matchCount > 1) {
                    return errorOutput(
                        EditErrorCode.AMBIGUOUS_REPLACE,
                        createAmbiguousEditMessage(matchCount, oldString)
                    )
                }

                const normalizedNewString = normalizeReplacementForMatch(match.strategy, newString)
                const actualNewString = preserveQuoteStyle(
                    oldString,
                    match.actualString,
                    normalizedNewString
                )
                const newContent = replace_all
                    ? currentContent.replaceAll(match.actualString, actualNewString)
                    : replaceOnce(currentContent, match.actualString, actualNewString)

                return writeEditResult({
                    filePath,
                    key,
                    readFileState,
                    originalFile: currentContent,
                    oldString: match.actualString,
                    newString: actualNewString,
                    newContent,
                    encoding: decoded.encoding,
                    lineEndings: detectLineEndings(decoded.content),
                    replaceAll: replace_all,
                    stats
                })
            } catch (error) {
                if (error instanceof SandboxPathError) {
                    return errorOutput(EditErrorCode.INVALID_PATH, error.message)
                }
                if (error instanceof UnsupportedTextFileError) {
                    return errorOutput('unsupported', error.message)
                }

                return errorOutput(
                    'io_error',
                    error instanceof Error ? error.message : String(error)
                )
            }
        },
        toModelOutput: ({ output }) => ({
            type: 'text' as const,
            value: formatEditFileModelContent(output)
        })
    })
}

/** 生成模型可见结果 */
export function formatEditFileModelContent(output: EditFileOutput) {
    if (!output.ok) return `<tool_use_error>${output.message}</tool_use_error>`

    const freshness = output.userModified
        ? ''
        : ' (file state is current in your context — no need to Read it back)'
    const modifiedNote = output.userModified
        ? ' The user modified your proposed changes before accepting them.'
        : ''

    if (output.replaceAll) {
        return `The file ${output.filePath} has been updated. All occurrences were successfully replaced.${modifiedNote}${freshness}`
    }

    return `The file ${output.filePath} has been updated successfully.${modifiedNote}${freshness}`
}

async function writeEditResult(input: {
    filePath: string
    key: string
    readFileState: Map<string, IReadFileState>
    originalFile: string
    oldString: string
    newString: string
    newContent: string
    encoding: TextFileEncoding
    lineEndings: TextFileLineEndings
    replaceAll: boolean
    stats: Stats
}): Promise<IEditFileSuccessOutput | IEditFileErrorOutput> {
    const latest = await stat(input.filePath)
    if (latest.mtimeMs !== input.stats.mtimeMs || latest.size !== input.stats.size) {
        return errorOutput(
            EditErrorCode.STALE_FILE,
            'File has been modified since read, either by the user or by a linter. Read it again before attempting to write it.'
        )
    }

    const output = applyLineEndings(input.newContent, input.lineEndings)
    await writeFile(input.filePath, encodeTextContent(output, input.encoding, input.filePath))
    const saved = await stat(input.filePath)

    input.readFileState.set(input.key, {
        content: input.newContent,
        encoding: input.encoding,
        lineEndings: input.lineEndings,
        mtimeMs: saved.mtimeMs,
        sizeBytes: saved.size,
        isPartialView: false,
        offset: 1
    })

    return {
        ok: true,
        filePath: input.filePath,
        oldString: input.oldString,
        newString: input.newString,
        originalFile: input.originalFile,
        structuredPatch: createStructuredPatch(input.originalFile, input.newContent),
        replaceAll: input.replaceAll,
        userModified: false
    }
}

function errorOutput(
    errorCode: IEditFileErrorOutput['errorCode'],
    message: string
): IEditFileErrorOutput {
    return { ok: false, errorCode, message }
}

function createAmbiguousEditMessage(candidateCount: number, oldString: string) {
    const preview = oldString.length > 200 ? `${oldString.slice(0, 200)}...` : oldString
    return `old_string is not unique in the file (${candidateCount} matches). Provide more surrounding context or set replace_all to true.\nString: ${preview}`
}

function replaceOnce(content: string, search: string, replacement: string) {
    const index = content.indexOf(search)
    if (index === -1) return content
    return content.slice(0, index) + replacement + content.slice(index + search.length)
}

function countOccurrences(content: string, search: string) {
    if (!search) return 0

    let count = 0
    let index = content.indexOf(search)

    while (index !== -1) {
        count++
        index = content.indexOf(search, index + search.length)
    }

    return count
}

function createStructuredPatch(original: string, updated: string): IStructuredPatchHunk[] {
    if (original === updated) return []

    const oldLines = original.split('\n')
    const newLines = updated.split('\n')
    let prefix = 0

    while (
        prefix < oldLines.length &&
        prefix < newLines.length &&
        oldLines[prefix] === newLines[prefix]
    ) {
        prefix++
    }

    let suffix = 0
    while (
        suffix < oldLines.length - prefix &&
        suffix < newLines.length - prefix &&
        oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
    ) {
        suffix++
    }

    const context = 3
    const start = Math.max(0, prefix - context)
    const oldEnd = Math.min(oldLines.length, oldLines.length - suffix + context)
    const newEnd = Math.min(newLines.length, newLines.length - suffix + context)
    const lines: string[] = []

    for (let index = start; index < prefix; index++) lines.push(` ${oldLines[index] ?? ''}`)
    for (let index = prefix; index < oldLines.length - suffix; index++) {
        lines.push(`-${oldLines[index] ?? ''}`)
    }
    for (let index = prefix; index < newLines.length - suffix; index++) {
        lines.push(`+${newLines[index] ?? ''}`)
    }
    for (let index = oldLines.length - suffix; index < oldEnd; index++) {
        lines.push(` ${oldLines[index] ?? ''}`)
    }

    return [
        {
            oldStart: start + 1,
            oldLines: oldEnd - start,
            newStart: start + 1,
            newLines: newEnd - start,
            lines
        }
    ]
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && 'code' in error
}
