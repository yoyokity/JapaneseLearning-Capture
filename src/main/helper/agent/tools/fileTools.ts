import type { IReadFileState } from './readFile'

import { createEditFileTool } from './editFile'
import { createReadFileTool } from './readFile'

/**
 * 创建文件工具集合
 * @remark read_file 与 edit_file 共享读取状态，保证编辑前必须读取
 */
export function createFileTools() {
    const readFileState = new Map<string, IReadFileState>()

    return {
        read_file: createReadFileTool({ readFileState }),
        edit_file: createEditFileTool({ readFileState })
    }
}

/**
 * 获取默认文件工具
 * @remark 每次请求创建一组新工具，读取状态只在本次工具循环内共享
 */
export function getDefaultFileTools() {
    return createFileTools()
}
