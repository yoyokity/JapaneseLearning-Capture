import type { ICue } from './types'

import { post } from '../ipc/net'

/**
 * 延迟
 * @param ms 毫秒
 */
function delay(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

/**
 * 按并发数执行任务
 * @param tasks 任务列表
 * @param limit 并发数
 */
async function runWithConcurrency(tasks: (() => Promise<void>)[], limit: number) {
    let index = 0
    const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
        while (index < tasks.length) {
            const task = tasks[index++]!
            await task()
        }
    })

    await Promise.all(workers)
}

/**
 * 谷歌翻译单条文本
 * @param text 文本
 */
async function translateByGoogle(text: string) {
    const searchParams = new URLSearchParams({
        rpcids: 'MkEWBc',
        'source-path': '/',
        hl: 'zh-CN',
        'soc-app': '1',
        'soc-platform': '1',
        'soc-device': '1'
    })
    const url = `https://translate.google.com/_/TranslateWebserverUi/data/batchexecute?${searchParams}`
    const payload = JSON.stringify([
        [['MkEWBc', JSON.stringify([[text, 'auto', 'zh-CN', 1], []]), null, 'generic']]
    ])
    const response = await post(url, `f.req=${encodeURIComponent(payload)}&`, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000
    })
    if (!response.ok) return ''

    try {
        const content = JSON.parse(String(response.body).replace(/^\)\]\}'/, ''))
        const data = JSON.parse(content[0][2]) as { 1: { 0: { 0: { 5: [string][] } } } }
        const phrases = data[1][0][0][5]

        return phrases.map(([value]) => value).join(' ')
    } catch {
        return ''
    }
}

/**
 * 谷歌翻译全部字幕
 * @param cues 字幕条
 * @param signal 取消信号
 * @param onProgress 进度回调
 */
export async function translateCuesWithGoogle(
    cues: ICue[],
    signal: AbortSignal,
    onProgress: (progress: number) => void
) {
    let finished = 0
    const tasks = cues.map((cue) => async () => {
        if (signal.aborted) return

        for (let attempt = 0; attempt < 3; attempt++) {
            const zh = await translateByGoogle(cue.text)
            if (zh) {
                cue.zh = zh
                break
            }
            await delay(500)
        }

        finished++
        onProgress(finished / cues.length)
        await delay(300)
    })

    await runWithConcurrency(tasks, 2)
}
