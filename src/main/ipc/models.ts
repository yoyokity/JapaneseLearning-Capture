import * as fs from 'node:fs'
import { join } from 'node:path'

import { appPath } from '../globalStates'

/**
 * 超分模型信息（供前端展示）
 */
export interface SuperResolutionModel {
    /** 模型名（前端硬编码，或目录扫描出的 .onnx 文件名去后缀） */
    name: string
    /** 模型文件名（models 目录下的 .onnx 文件名） */
    path: string
    /** 模型说明，目录扫描补充的模型无说明 */
    description: string
}

/**
 * image-polish 目录：build/dev 时构建产物会复制到 tools/image-polish，
 * 打包后经 extraResource: ['tools'] 原样带入 resources/tools/image-polish
 */
export const imagePolishDir = (): string => join(appPath.extraResource, 'tools/image-polish')

/**
 * 获取 image-polish/models 目录下全部模型文件名（不带 .onnx 后缀）
 */
export async function getSuperResolutionModels(): Promise<string[]> {
    const dir = join(imagePolishDir(), 'models')
    try {
        const files = await fs.promises.readdir(dir)
        return files.filter((file) => file.endsWith('.onnx')).map((file) => file.replace(/\.onnx$/, ''))
    } catch {
        // 目录不存在时返回空列表，前端仅展示硬编码模型
        return []
    }
}