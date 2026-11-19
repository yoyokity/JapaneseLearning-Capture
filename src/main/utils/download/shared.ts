/** 下载并发数 */
export const DOWNLOAD_CONNECTIONS = 8
/** 每个分块大小 */
export const DOWNLOAD_BLOCK_SIZE = 8 * 1024 * 1024

/** 按并发限制执行任务 */
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
