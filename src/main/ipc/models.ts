import * as fs from 'node:fs'
import { join } from 'node:path'

import { appPath } from '../globalStates'

/**
 * 超分模型信息（供前端展示）
 */
export interface SuperResolutionModel {
    /** 模型名 */
    name: string
    /** 模型说明 */
    description: string
}

/**
 * 模型文件信息（tools/models/models.json 的值结构）
 */
export interface ModelFileInfo {
    /** 模型文件名（相对 tools/models 目录） */
    file: string
    /** 模型说明 */
    description: string
}

/**
 * 模型名 → 模型文件信息映射（tools/models/models.json），进程内缓存
 */
let modelFileMap: Record<string, ModelFileInfo> | undefined
export const loadModelFileMap = async (): Promise<Record<string, ModelFileInfo>> => {
    if (!modelFileMap) {
        const jsonPath = join(appPath.extraResource, 'tools/models/models.json')
        modelFileMap = JSON.parse(await fs.promises.readFile(jsonPath, 'utf-8')) as Record<
            string,
            ModelFileInfo
        >
    }
    return modelFileMap
}

/**
 * 获取所有可用超分模型
 */
export async function getSuperResolutionModels(): Promise<SuperResolutionModel[]> {
    const modelMap = await loadModelFileMap()
    return Object.entries(modelMap).map(([name, info]) => ({ name, description: info.description }))
}
