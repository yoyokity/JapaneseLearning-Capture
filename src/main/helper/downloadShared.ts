/** 分块下载并发数，实测 8 路可跑满带宽 */
export const DOWNLOAD_CONNECTIONS = 8
/** 每个分块大小 */
export const DOWNLOAD_BLOCK_SIZE = 8 * 1024 * 1024

/**
 * 按限制并发执行任务
 * @param tasks 任务列表
 * @param limit 并发数
 */
export async function runWithConcurrency(tasks: (() => Promise<void>)[], limit: number) {
    let index = 0
    const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
        while (index < tasks.length) {
            const task = tasks[index++]!
            await task()
        }
    })

    await Promise.all(workers)
}
