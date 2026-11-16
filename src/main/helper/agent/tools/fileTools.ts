import type { IReadFileState } from './readFile'

import { createEditFileTool } from './editFile'
import { createReadFileTool } from './readFile'

/** 文件工具参数 */
export interface IFileToolOptions {
    /** 相对路径的基准目录 */
    cwd?: string | undefined
}

/**
 * 创建文件工具集合
 * @param options 文件工具参数
 * @remark read_file 与 edit_file 共享读取状态，保证编辑前必须读取
 */
export function createFileTools(options: IFileToolOptions = {}) {
    const readFileState = new Map<string, IReadFileState>()

    return {
        read_file: createReadFileTool({ ...options, readFileState }),
        edit_file: createEditFileTool({ ...options, readFileState })
    }
}

/**
 * 获取默认文件工具
 * @param cwd 相对路径基准目录
 * @remark 每次请求创建一组新工具，读取状态只在本次工具循环内共享
 */
export function getDefaultFileTools(cwd?: string) {
    return createFileTools({ cwd: cwd ?? process.cwd() })
}
