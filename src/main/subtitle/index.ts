import type { ChildProcess } from 'node:child_process'
import type { ICue, IGenerateSubtitleInput, ISubtitleProgress } from './types'

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { observable } from '@trpc/server/observable'
import { app } from 'electron'

import { appPath } from '../globalStates'
import { parseSegments, runCrispasr } from './asr'
import { extractAudio } from './audio'
import { renderSrt, splitIntoCues } from './cue'
import { translateCuesWithGoogle } from './google'
import { correctSegments, translateCues } from './llm'

export * from './types'

/**
 * 获取依赖程序与模型路径
 */
function getSubtitlePaths() {
    const toolsDir = join(appPath.extraResource, 'tools')

    return {
        crispasr: join(toolsDir, 'subtitle/runtimes/windows-x64/cuda/bin/crispasr.exe'),
        model: join(toolsDir, 'subtitle-cohere/cohere-transcribe-q4_k.gguf'),
        aligner: join(toolsDir, 'subtitle/models/qwen3-forced-aligner.gguf'),
        vad: join(toolsDir, 'subtitle/models/vad/whisper-vad-asmr-q4_k.gguf')
    }
}

/**
 * 路径是否全为 ASCII
 * @param value 路径
 * @remark crispasr 无法读取非 ASCII 路径
 */
function isAsciiPath(value: string) {
    return /^[\x20-\x7E]*$/.test(value)
}

/**
 * 终止进程树
 * @param child 子进程
 * @remark crispasr 会派生子进程
 */
function killProcessTree(child: ChildProcess | null) {
    if (!child?.pid) return

    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
}

/**
 * 创建字幕生成任务
 * @param input 生成参数
 */
export function createSubtitleStream(input: IGenerateSubtitleInput) {
    return observable<ISubtitleProgress>((emit) => {
        let currentChild: ChildProcess | null = null
        let cancelled = false
        const controller = new AbortController()
        const workDir = join(app.getPath('temp'), 'JapLC-subtitle', String(Date.now()))

        const emitProgress = (progress: ISubtitleProgress) => {
            if (!cancelled) emit.next(progress)
        }

        const run = async () => {
            try {
                if (!existsSync(input.inputPath)) {
                    throw new Error('输入文件不存在')
                }
                if (input.aiOptimize && !input.llm) {
                    throw new Error('未配置 AI 翻译引擎，请先在 设置 → 翻译 中配置')
                }

                const paths = getSubtitlePaths()
                const requiredPaths = [paths.crispasr, paths.model, paths.aligner, paths.vad]
                if (requiredPaths.some((path) => !existsSync(path))) {
                    throw new Error('未安装字幕生成依赖，请先在 设置 → 依赖 中下载')
                }
                if (!requiredPaths.every(isAsciiPath)) {
                    throw new Error(
                        '应用安装路径包含非 ASCII 字符，语音识别程序无法读取模型，请安装到纯英文路径'
                    )
                }

                const ffmpegPath = join(appPath.extraResource, 'tools/ffmpeg/ffmpeg.exe')
                if (!existsSync(ffmpegPath)) {
                    throw new Error('未安装 FFmpeg 依赖，请先在 设置 → 依赖 中下载')
                }

                mkdirSync(join(workDir, 'out'), { recursive: true })

                // 1. 提取音频
                emitProgress({ stage: 'extract', progress: 0 })
                await extractAudio(
                    ffmpegPath,
                    input.inputPath,
                    join(workDir, 'audio.wav'),
                    (progress) => emitProgress({ stage: 'extract', progress }),
                    (child) => {
                        currentChild = child
                    }
                )
                if (cancelled) return

                // 2. 语音识别
                emitProgress({ stage: 'asr', progress: -1 })
                await runCrispasr(
                    {
                        crispasrPath: paths.crispasr,
                        workDir,
                        modelPath: paths.model,
                        alignerPath: paths.aligner,
                        vadPath: paths.vad,
                        language: input.language
                    },
                    (child) => {
                        currentChild = child
                    }
                )
                if (cancelled) return

                const resultPath = join(workDir, 'out', 'result.json')
                if (!existsSync(resultPath)) {
                    throw new Error(
                        '语音识别没有生成结果，可能是显存或内存不足，请关闭占用较大的程序后重试'
                    )
                }

                const segments = parseSegments(resultPath)
                if (!segments.length) {
                    throw new Error('未识别到语音内容')
                }

                let cues: ICue[]
                if (input.aiOptimize && input.llm) {
                    // 3. AI 纠错切分
                    emitProgress({ stage: 'optimize', progress: -1, message: '正在纠错与切分' })
                    const drafts = await correctSegments(
                        segments,
                        input.language,
                        input.llm,
                        controller.signal,
                        (progress) => emitProgress({ stage: 'optimize', progress })
                    )
                    cues = drafts.map((cue, index) => ({ ...cue, id: `c${index}` }))

                    // 4. AI 翻译
                    emitProgress({ stage: 'translate', progress: -1, message: '正在翻译' })
                    await translateCues(
                        cues,
                        input.language,
                        input.llm,
                        controller.signal,
                        (progress) => emitProgress({ stage: 'translate', progress })
                    )
                } else {
                    // 3. 直接切分并谷歌翻译
                    cues = segments
                        .flatMap((segment) => splitIntoCues(segment.words, input.language))
                        .map((cue, index) => ({ ...cue, id: `c${index}` }))

                    emitProgress({ stage: 'translate', progress: 0, message: '正在翻译' })
                    await translateCuesWithGoogle(cues, controller.signal, (progress) =>
                        emitProgress({ stage: 'translate', progress })
                    )
                }
                if (cancelled) return

                const outputPath = join(
                    dirname(input.inputPath),
                    `${basename(input.inputPath, extname(input.inputPath))}.zh-CN.srt`
                )
                writeFileSync(outputPath, renderSrt(cues), 'utf8')

                emitProgress({ stage: 'translate', progress: 1, outputPath })
                emit.complete()
            } catch (error) {
                if (!cancelled) {
                    emit.error(error instanceof Error ? error : new TypeError(String(error)))
                }
            } finally {
                rmSync(workDir, { recursive: true, force: true })
            }
        }

        void run()

        return {
            unsubscribe() {
                cancelled = true
                controller.abort()
                killProcessTree(currentChild)
            }
        }
    })
}
