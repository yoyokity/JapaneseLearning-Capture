import type { Buffer } from 'node:buffer'
import type { ChildProcess } from 'node:child_process'
import type { ISegment, IWord, SubtitleLanguage } from './types'

import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 调用 crispasr 生成逐字 JSON
 */
export function runCrispasr(
    options: {
        crispasrPath: string
        workDir: string
        modelPath: string
        alignerPath: string
        vadPath: string
        language: SubtitleLanguage
    },
    onChild: (child: ChildProcess) => void
) {
    return new Promise<void>((resolve, reject) => {
        const child = spawn(
            options.crispasrPath,
            [
                '--backend',
                'cohere',
                '-m',
                options.modelPath,
                '-f',
                'audio.wav',
                '--vad',
                '-vm',
                options.vadPath,
                '-am',
                options.alignerPath,
                '--force-aligner',
                '-l',
                options.language,
                '--split-on-punct',
                '-of',
                join('out', 'result'),
                '-ojf'
            ],
            {
                cwd: options.workDir,
                windowsHide: true,
                env: { ...process.env, GGML_CUDA_DISABLE_GRAPHS: '1' }
            }
        )
        onChild(child)

        let output = ''
        const append = (chunk: Buffer) => {
            output = (output + chunk.toString()).slice(-2000)
        }
        child.stdout.on('data', append)
        child.stderr.on('data', append)

        child.on('error', reject)
        child.on('close', (code) => {
            if (code === 0) {
                resolve()
                return
            }
            reject(new Error(`语音识别失败：${output}`))
        })
    })
}

/**
 * 修正词时间
 * @param words 词列表
 * @remark 保证单调递增且有正时长
 */
function normalizeWordTimes(words: IWord[]) {
    let previous = 0

    return words.map((word) => {
        const from = Math.max(word.from, previous)
        const to = Math.max(word.to, from + 40)
        previous = to

        return { text: word.text, from, to }
    })
}

/**
 * 解析 crispasr 的 json-full 结果
 * @param jsonPath JSON 路径
 */
export function parseSegments(jsonPath: string): ISegment[] {
    const raw = JSON.parse(readFileSync(jsonPath, 'utf8')) as {
        transcription?: {
            text?: string
            offsets?: { from?: number; to?: number }
            words?: {
                text?: string
                offsets?: { from?: number; to?: number }
                t0?: number
                t1?: number
            }[]
        }[]
    }
    if (!Array.isArray(raw.transcription)) {
        throw new TypeError('识别结果缺少 transcription')
    }

    return raw.transcription.flatMap((segment) => {
        const words = (segment.words ?? []).flatMap((word) => {
            const text = String(word.text ?? '')
            if (!text) return []

            const from = Number(word.offsets?.from ?? Number(word.t0 ?? 0) * 10)
            const to = Number(word.offsets?.to ?? Number(word.t1 ?? 0) * 10)
            return [
                { text, from: Number.isFinite(from) ? from : 0, to: Number.isFinite(to) ? to : 0 }
            ]
        })
        if (words.length) return [{ words: normalizeWordTimes(words) }]

        // 没有词级时间时退化为整段
        const text = String(segment.text ?? '').trim()
        if (!text) return []

        const from = Number(segment.offsets?.from ?? 0)
        const to = Number(segment.offsets?.to ?? from)
        return [{ words: [{ text, from, to }] }]
    })
}
