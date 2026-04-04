import { ipcMain, session } from 'electron'
import fetch from 'electron-fetch'
import iconv from 'iconv-lite'

import { tryExecute } from './func'

// 定义兼容的请求选项类型
interface IFetchOptions {
    headers?: Record<string, string>
    timeout?: number
    parse?: 'arrayBuffer' | 'blob' | 'formData' | 'json' | 'text' | 'buffer'
}

interface IResult<T> {
    ok: boolean
    status: number
    statusText: string
    headers: Record<string, string>
    body: T
}

/**
 * 发送 GET 请求
 */
ipcMain.handle('net:get', async (_, url: string, options?: IFetchOptions) => {
    return await tryExecute(async () => {
        const response = await fetch(url, {
            method: 'GET',
            timeout: 7000, // 默认超时7秒
            ...(options || {})
        })

        const result: IResult<any> = {
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries()),
            body: null
        }

        if (options?.parse === 'arrayBuffer') {
            result.body = await response.arrayBuffer()
        } else if (options?.parse === 'blob') {
            result.body = await response.blob()
        } else if (options?.parse === 'formData') {
            result.body = await response.formData()
        } else if (options?.parse === 'json') {
            result.body = await response.json()
        } else {
            result.body = await response.text()
        }

        return result
    })
})

/**
 * 发送 POST 请求
 */
ipcMain.handle('net:post', async (_, url: string, body: any, options?: IFetchOptions) => {
    return await tryExecute(async () => {
        // 处理请求体
        let _body: any = body
        let headers: Record<string, string> = options?.headers || {}

        // 如果数据是对象，自动转为 JSON
        if (
            typeof body === 'object' &&
            !(body instanceof ArrayBuffer) &&
            !ArrayBuffer.isView(body)
        ) {
            _body = JSON.stringify(body)
            headers = {
                'Content-Type': 'application/json',
                ...headers
            }
        }

        const response = await fetch(url, {
            method: 'POST',
            body: _body,
            headers,
            timeout: 7000, // 默认超时7秒
            ...(options || {})
        })

        const result: IResult<any> = {
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries()),
            body: null
        }

        if (options?.parse === 'arrayBuffer') {
            result.body = await response.arrayBuffer()
        } else if (options?.parse === 'blob') {
            result.body = await response.blob()
        } else if (options?.parse === 'formData') {
            result.body = await response.formData()
        } else if (options?.parse === 'json') {
            result.body = await response.json()
        } else if (options?.parse === 'buffer') {
            result.body = await response.buffer()
        } else {
            result.body = await response.text()
        }

        return result
    })
})

/**
 * 设置defaultSession的代理
 */
ipcMain.handle(
    'net:setProxy',
    async (
        _,
        config: {
            proxyRules: string
            proxyBypassRules?: string
        }
    ) => {
        return await tryExecute(async () => {
            await session.defaultSession.setProxy(config)
        })
    }
)

/**
 * 取消defaultSession的代理设置
 */
ipcMain.handle('net:clearProxy', async () => {
    return await tryExecute(async () => {
        await session.defaultSession.setProxy({
            mode: 'direct'
        })
    })
})

/**
 * 清除defaultSession的缓存
 */
ipcMain.handle('net:clearCache', async () => {
    return await tryExecute(session.defaultSession.clearCache)
})

/**
 * Ping检测网络连通性
 * @param host 主机地址
 * @param timeout 超时时间（毫秒）
 */
ipcMain.handle('net:ping', async (_, host: string, timeout: number = 3000) => {
    return await tryExecute(async () => {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), timeout)

        try {
            const startTime = Date.now()
            const response = await fetch(`http://${host}`, {
                method: 'HEAD',
                signal: controller.signal
            })
            const endTime = Date.now()

            clearTimeout(timeoutId)

            return {
                success: response.ok,
                time: endTime - startTime,
                status: response.status
            }
        } catch (error) {
            clearTimeout(timeoutId)
            return {
                success: false,
                time: -1,
                status: -1,
                error: (error as Error).message
            }
        }
    })
})

/**
 * 按指定编码输出字节数组
 * @param value 原始字符串
 * @param encoding 字符编码
 */
ipcMain.handle('net:encode', async (_, value: string, encoding: string = 'utf-8') => {
    return await tryExecute(async () => {
        const buffer = iconv.encode(value, encoding)
        return Array.from(buffer)
    })
})
