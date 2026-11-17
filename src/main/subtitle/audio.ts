import type { Buffer } from 'node:buffer'
import type { ChildProcess } from 'node:child_process'

import { spawn } from 'node:child_process'

/** 总时长 */
const DURATION_PATTERN = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/
/** 当前处理时间 */
const TIME_PATTERN = /time=\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/g

/** 提取 16k 单声道音频 */
export function extractAudio(
    ffmpegPath: string,
    inputPath: string,
    outputPath: string,
    onProgress: (progress: number) => void,
    onChild: (child: ChildProcess) => void
) {
    return new Promise<void>((resolve, reject) => {
        const child = spawn(
            ffmpegPath,
            [
                '-hide_banner',
                '-nostdin',
                '-y',
                '-i',
                inputPath,
                '-map',
                '0:a:0',
                '-vn',
                '-ac',
                '1',
                '-ar',
                '16000',
                '-c:a',
                'pcm_s16le',
                outputPath
            ],
            { windowsHide: true }
        )
        onChild(child)

        let pendingText = ''
        let totalDuration: number | null = null
        let lastTime = 0

        child.stderr.on('data', (chunk: Buffer) => {
            pendingText += chunk.toString()

            const durationMatch = DURATION_PATTERN.exec(pendingText)
            if (durationMatch) {
                const [, h, m, s] = durationMatch
                const duration = Number(h) * 3600 + Number(m) * 60 + Number(s)
                if (duration > 0) totalDuration = duration
            }

            const lastMatch = [...pendingText.matchAll(TIME_PATTERN)].at(-1)
            if (lastMatch) {
                const [, h, m, s] = lastMatch
                const time = Number(h) * 3600 + Number(m) * 60 + Number(s)
                if (time !== lastTime) {
                    lastTime = time
                    onProgress(totalDuration ? Math.min(time / totalDuration, 1) : -1)
                }
            }

            if (pendingText.length > 128) {
                pendingText = pendingText.slice(-64)
            }
        })

        child.on('error', reject)
        child.on('close', (code) => {
            if (code === 0) {
                resolve()
                return
            }
            reject(new Error(`提取音频失败：${pendingText.slice(-500)}`))
        })
    })
}
