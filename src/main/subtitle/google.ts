import type { ICue } from './types'

import { post } from '../ipc/net'

/** 延迟 */
function delay(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

/** 谷歌翻译单条文本 */
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

/** 谷歌翻译全部字幕 */
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

    // 并发 2
    let index = 0
    await Promise.all(
        Array.from({ length: Math.min(2, tasks.length) }, async () => {
            while (index < tasks.length) {
                await tasks[index++]!()
            }
        })
    )
}
