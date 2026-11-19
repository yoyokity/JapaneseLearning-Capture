import * as fs from 'node:fs'
import { join } from 'node:path'
import { observable } from '@trpc/server/observable'
import { app } from 'electron'
import sharp from 'sharp'
import { v7 } from 'uuid'

import { appPath } from '../../globalStates'
import { Cmd } from '../../utils/shell'
import { resize } from './image'

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
        return files
            .filter((file) => file.endsWith('.onnx'))
            .map((file) => file.replace(/\.onnx$/, ''))
    } catch {
        // 目录不存在时返回空列表，前端仅展示硬编码模型
        return []
    }
}

/**
 * 调用 imagepolish 批量处理图片
 * @param inputPaths 输入图片路径数组
 * @param modelFilePath 模型文件绝对路径，为空时仅执行非AI修复链
 * @param onOk 每处理完一张图片（stdout 输出一行 "ok:"）时的回调，参数为已完成的张数
 * @remark 批量模式下 -o 会被忽略，每张输出为 <输入路径>_output.<同扩展名>
 */
const runImagePolish = (
    inputPaths: string[],
    modelFilePath: string,
    onOk?: (doneCount: number) => void
) =>
    new Promise<void>((resolve, reject) => {
        // 共用滤镜链，AI 与非AI仅 aa/sharpen/grain 强度不同，AI 额外在 dehalo 后接 --model
        const args: string[] = []
        for (const inputPath of inputPaths) {
            args.push('-i', inputPath)
        }
        args.push(
            '--denoise',
            '6',
            '--deband',
            'range=12,y=60,cbcr=24',
            '--deband',
            'range=24,y=40,cbcr=16',
            '--aa',
            modelFilePath ? '1' : '2',
            '--sharpen',
            modelFilePath ? '0.8' : '0.9',
            '--dehalo'
        )
        if (modelFilePath) {
            args.push('--model', modelFilePath)
        }
        args.push('--grain', modelFilePath ? '15' : '10')

        const cmd = new Cmd(join(imagePolishDir(), 'imagepolish.exe')).run(args)

        // imagepolish 每完成一张会在 stdout 输出一行 "ok:"（已实时 flush），按行统计已完成张数
        let pendingText = ''
        let doneCount = 0
        cmd.onOutputLine((text) => {
            pendingText += text
            const lines = pendingText.split('\n')
            pendingText = lines.pop() ?? ''
            for (const line of lines) {
                if (line.startsWith('ok:')) {
                    onOk?.(++doneCount)
                }
            }
        })

        cmd.onExit((code, _stdout, stderr) => {
            if (code === 0) {
                resolve()
            } else {
                reject(new Error(stderr || `imagepolish exited with code ${code}`))
            }
        })
    })

/**
 * 批量超分图片（imagepolish）
 * @param imagePaths 输入图片路径数组
 * @param modelPath 模型文件名（image-polish/models 目录下的 .onnx 文件名，空串表示非AI修复）
 * @param onProgress 进度回调 0-1，每处理完一张图片递增 1/总数
 * @returns 超分后的本地图片路径数组，单张失败的项为 null
 */
export async function superResolutionImage(
    imagePaths: string[],
    modelPath: string,
    onProgress?: (progress: number) => void
): Promise<(string | null)[]> {
    const modelFilePath = modelPath ? join(imagePolishDir(), 'models', modelPath) : ''
    if (modelPath && !fs.existsSync(modelFilePath)) {
        throw new Error(`未知超分模型文件: ${modelPath}`)
    }

    const results = Array.from({ length: imagePaths.length }).fill(null) as (string | null)[]

    // 统一转成 PNG 临时输入副本（imagepolish 仅通过 stb_image 读取，webp 等需先转码；源文件只在转换瞬间被读取，之后与源文件完全隔离）
    const inputs: { index: number; path: string }[] = []
    for (const [index, imagePath] of imagePaths.entries()) {
        try {
            const tempInputPath = join(
                app.getPath('temp'),
                `${v7()}_super_resolution_input_${index}.png`
            )
            await sharp(imagePath).removeAlpha().png().toFile(tempInputPath)
            inputs.push({ index, path: tempInputPath })
        } catch (error) {
            console.warn(`[super-resolution] 单张超分失败：${imagePath}`, error)
        }
    }

    try {
        // 一次调用批量处理，避免每张重新启动进程重复加载 GPU 与模型
        if (inputs.length) {
            // 批处理进度按 stdout 的 "ok:" 行推进，每完成一张递增 1/总数
            await runImagePolish(
                inputs.map((item) => item.path),
                modelFilePath,
                (doneCount) => onProgress?.(doneCount / inputs.length)
            )
        }
    } catch (error) {
        console.warn('[super-resolution] 批量超分失败', error)
        await Promise.all(
            inputs.map((item) => fs.promises.rm(item.path, { force: true }).catch(() => {}))
        )
        return results
    }

    for (const { index, path: tempInputPath } of inputs) {
        // 批量模式下输出为 <输入>_output.<同扩展名>
        const rawResultPath = tempInputPath.replace(/\.png$/, '_output.png')
        try {
            // 输出最长边不超过 3840，保存 jpeg
            const outputImage = await resize(sharp(rawResultPath), {
                maxHeight: 3840,
                maxWidth: 3840,
                minWidth: -1,
                minHeight: -1
            })
            const tempResultPath = join(app.getPath('temp'), `${v7()}_super_resolution.jpg`)
            await outputImage.jpeg({ quality: 92 }).toFile(tempResultPath)
            results[index] = tempResultPath
        } catch (error) {
            console.warn(`[super-resolution] 单张超分失败：${imagePaths[index]}`, error)
        } finally {
            // 清理临时输入副本与中间结果
            await fs.promises.rm(tempInputPath, { force: true }).catch(() => {})
            await fs.promises.rm(rawResultPath, { force: true }).catch(() => {})
        }
    }
    return results
}

/**
 * 超分进度信息
 */
export interface ISuperResolutionProgress {
    /**
     * 总进度 0-1
     */
    progress: number
    /**
     * 全部完成后的结果数组（仅最后一次回调携带）
     */
    results?: (string | null)[]
}

/**
 * 订阅式批量超分，逐张推进度并在全部完成后回传结果数组
 */
export function createSuperResolutionImageStream(imagePaths: string[], modelPath: string) {
    return observable<ISuperResolutionProgress>((emit) => {
        void (async () => {
            try {
                const results = await superResolutionImage(imagePaths, modelPath, (progress) => {
                    emit.next({ progress })
                })
                emit.next({ progress: 1, results })
                emit.complete()
            } catch (error) {
                emit.error(error instanceof Error ? error : new Error(String(error)))
            }
        })()

        return {
            unsubscribe() {}
        }
    })
}
