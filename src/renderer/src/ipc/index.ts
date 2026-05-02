import type { AppRouter } from '@shared'

import { createTRPCProxyClient } from '@trpc/client'
import { ipcLink } from 'electron-trpc/renderer'
import superjson from 'superjson'

/**
 * electron-trpc 客户端
 */
export const ipc = createTRPCProxyClient<AppRouter>({
    links: [ipcLink()],
    transformer: superjson
})

/**
 * 发送不关心返回值的任务
 */
export function sendTask(task: Promise<unknown>) {
    void task.catch(() => {})
}
