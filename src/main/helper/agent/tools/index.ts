import type { ICommitToolOptions } from './commitSubtitle'

import { createCommitTool } from './commitSubtitle'

export * from './commitSubtitle'
export * from './editFile'
export * from './editMatchers'
export * from './fileTools'
export * from './options'
export * from './readFile'
export * from './textFile'

/**
 * 创建工具集合
 * @param options 提交工具参数
 * @remark commit_subtitle 绑定当前字幕任务，需显式传入；read_file / edit_file 由默认工具提供
 */
export function createTools(options: ICommitToolOptions) {
    return { commit_subtitle: createCommitTool(options) }
}
