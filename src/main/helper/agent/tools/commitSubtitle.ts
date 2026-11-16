import { tool } from 'ai'
import { z } from 'zod'

interface ICommitWord {
    /** 开始时间（毫秒） */
    from: number
    /** 结束时间（毫秒） */
    to: number
}

interface ICommitRange {
    /** 起始词索引 */
    fromWord: number
    /** 结束词索引 */
    toWord: number
    /** 译文 */
    zh: string
}

export interface ICommitToolOptions {
    /** 全部词 */
    words: ICommitWord[]
    /** 已覆盖词索引 */
    claimed: Set<number>
    /** 已提交范围 */
    ranges: ICommitRange[]
    /** 单行最大时长（毫秒） */
    maxCueMs: number
}

/**
 * 创建提交字幕工具
 * @param options 工具参数
 * @remark 提交内容按全局词索引记录到 ranges，同时标记 claimed
 */
export function createCommitTool(options: ICommitToolOptions) {
    const { words, claimed, ranges, maxCueMs } = options

    return tool({
        description:
            '提交一条最终字幕。fromWord/toWord 是全局词索引（包含两端），必须完整覆盖所有词且不能重叠；zh 为简体中文译文，空字符串表示删除。',
        inputSchema: z.object({
            fromWord: z.number().int().min(0),
            toWord: z.number().int().min(0),
            zh: z.string()
        }),
        execute: ({ fromWord, toWord, zh }) => {
            if (fromWord < 0 || toWord >= words.length || fromWord > toWord) {
                return { ok: false, error: `词索引范围 ${fromWord}-${toWord} 无效` }
            }

            // execute 保持同步，保证并发调用下的覆盖检查是原子的
            for (let index = fromWord; index <= toWord; index++) {
                if (claimed.has(index)) {
                    return { ok: false, error: `词索引 ${index} 已被其他字幕覆盖` }
                }
            }

            const first = words[fromWord]
            const last = words[toWord]
            if (!first || !last) return { ok: false, error: '词索引不存在' }
            if (last.to - first.from > maxCueMs) {
                return { ok: false, error: `该范围超过 ${maxCueMs / 1000} 秒，请拆成多行` }
            }

            for (let index = fromWord; index <= toWord; index++) claimed.add(index)

            ranges.push({
                fromWord,
                toWord,
                zh: zh.replace(/\s+/g, ' ').trim()
            })

            return { ok: true, remaining: words.length - claimed.size }
        }
    })
}
