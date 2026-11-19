import type { CmdHandle } from '../../utils/shell'

import * as fs from 'node:fs'
import { join } from 'node:path'
import { observable } from '@trpc/server/observable'

import { appPath } from '../../globalStates'
import { Cmd } from '../../utils/shell'

/**
 * 读取媒体信息
 */
export async function readMediaInfo(path: string) {
    const ars = ['--Output=JSON', path]
    const mediainfoPath = join(appPath.extraResource, 'tools/mediainfo/MediaInfo.exe')

    return await new Promise<string>((resolve, reject) => {
        const mediainfo = new Cmd(mediainfoPath)
        const cmd = mediainfo.run(ars)
        cmd.onExit(async (code, text) => {
            if (code === 0) {
                resolve(text)
            } else {
                reject(new Error(text))
            }
        })
    })
}

/**
 * 音频重编码进度信息
 */
export interface IReencodeAudioProgress {
    /**
     * 进度 0-1，读取不到总时长时为 -1
     */
    progress: number
    /**
     * 当前处理到的时间（秒）
     */
    time: number
}

/**
 * 正在进行的音频重编码输出路径，防止同一输出被多个 ffmpeg 同时写入
 */
const activeEncodes = new Set<string>()

/**
 * 使用 ffmpeg 重编码音频并推送进度
 * ffmpeg -i input.mkv -map 0 -c copy -c:a aac -ar 48000 -b:a 320k output.mkv
 * @remark 总时长取自 ffmpeg 输入信息中的 Duration 行，进度 = 当前 time / 总时长（视频为直拷时 frame 不增长，不能用作进度）
 * @remark 取消订阅时会终止 ffmpeg 进程
 */
export function createReencodeAudioStream(
    inputPath: string,
    outputPath: string,
    codec: string,
    sampleRate: number,
    bitrate: string
) {
    return observable<IReencodeAudioProgress>((emit) => {
        let cmdHandle: CmdHandle | null = null
        let isCancelled = false

        void (async () => {
            if (activeEncodes.has(outputPath)) {
                emit.error(new Error('该输出文件已有编码任务在进行中'))
                return
            }

            const ffmpegPath = join(appPath.extraResource, 'tools/ffmpeg/ffmpeg.exe')
            const args = [
                '-y',
                '-i',
                inputPath,
                '-map',
                '0',
                '-c',
                'copy',
                '-c:a',
                codec,
                '-ar',
                String(sampleRate),
                '-b:a',
                bitrate,
                outputPath
            ]

            // ffmpeg 将进度实时输出到 stderr 并用 \r 刷新同一行，直接对收到的数据块全局匹配：
            // 总时长取输入信息里的 “Duration: HH:MM:SS.ms”，当前时间取最新统计行的 time=
            let pendingText = ''
            let totalDuration: number | null = null
            let lastTime = 0

            try {
                activeEncodes.add(outputPath)

                await new Promise<void>((resolve, reject) => {
                    const ffmpeg = new Cmd(ffmpegPath)
                    const cmd = ffmpeg.run(args)
                    cmdHandle = cmd

                    cmd.onErrorLine((text) => {
                        if (isCancelled) return
                        pendingText += text

                        const durationMatch = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(
                            pendingText
                        )
                        if (durationMatch) {
                            const [, h, m, s] = durationMatch
                            const duration = Number(h) * 3600 + Number(m) * 60 + Number(s)
                            if (duration > 0) totalDuration = duration
                        }

                        const matches = [
                            ...pendingText.matchAll(/time=\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/g)
                        ]
                        const lastMatch = matches.at(-1)
                        if (lastMatch) {
                            const [, h, m, s] = lastMatch
                            const time = Number(h) * 3600 + Number(m) * 60 + Number(s)
                            if (time !== lastTime) {
                                lastTime = time
                                emit.next({
                                    progress: totalDuration
                                        ? Math.min(time / totalDuration, 1)
                                        : -1,
                                    time
                                })
                            }
                        }

                        // 只保留尾部片段，防止缓冲无限增长，同时能拼回被数据块截断的关键字（最长的 Duration 行部分匹配约 26 字符）
                        if (pendingText.length > 128) {
                            pendingText = pendingText.slice(-64)
                        }
                    })

                    cmd.onExit((code, _stdout, stderr) => {
                        if (code !== 0) {
                            reject(new Error(stderr || `ffmpeg exited with code ${code}`))
                            return
                        }

                        // 校验输出文件确实写入成功，避免把源文件误移入回收站
                        try {
                            if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
                                resolve()
                            } else {
                                reject(new Error(`输出文件为空或不存在：${outputPath}`))
                            }
                        } catch {
                            reject(new Error(`无法读取输出文件：${outputPath}`))
                        }
                    })
                })

                emit.next({ progress: totalDuration ? 1 : -1, time: totalDuration ?? lastTime })
                emit.complete()
            } catch (error) {
                if (!isCancelled) {
                    emit.error(error instanceof Error ? error : new Error(String(error)))
                }
            } finally {
                activeEncodes.delete(outputPath)
            }
        })()

        return {
            unsubscribe() {
                isCancelled = true
                cmdHandle?.kill()
            }
        }
    })
}
