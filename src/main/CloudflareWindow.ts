import type { IVerifyCookies } from './ipc/net'

import { resolve } from 'node:path'
import { BrowserWindow } from 'electron'

const iconPath = resolve(__dirname, '../../resources/mainIcon.png')

let cfWindow: BrowserWindow | null = null

/**
 * 打开 Cloudflare 验证窗口
 * @param url 需要验证的网站 URL
 * @param targetCookies 目标 Cookie 名称数组，检测到所有 Cookie 后自动关闭窗口
 * @returns 返回验证结果，包含 Cookie 信息
 */
export async function openCloudflareWindow(
    url: string,
    targetCookies: string[] = ['XSRF-TOKEN']
): Promise<IVerifyCookies> {
    return new Promise((resolve) => {
        // 如果已有窗口，先关闭
        if (cfWindow && !cfWindow.isDestroyed()) {
            cfWindow.close()
        }

        cfWindow = new BrowserWindow({
            width: 600,
            height: 700,
            icon: iconPath,
            autoHideMenuBar: true,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: true
            }
        })

        cfWindow.menuBarVisible = false

        // 获取窗口的 session
        const windowSession = cfWindow.webContents.session

        // 从 URL 提取域名
        const urlObj = new URL(url)

        // 监听 Cookie 变化
        const checkCookies = async (): Promise<IVerifyCookies | null> => {
            if (!cfWindow || cfWindow.isDestroyed()) return null

            try {
                // 获取该域名下的所有 Cookie
                const cookies = await windowSession.cookies.get({ domain: urlObj.hostname })
                const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join('; ')

                // 获取目标 Cookie 键值对
                const foundCookies: Record<string, string> = {}
                for (const name of targetCookies) {
                    const cookie = cookies.find((c) => c.name === name)
                    if (cookie) {
                        foundCookies[name] = cookie.value
                    }
                }

                // 检查是否获取到所有目标 Cookie
                const allFound = targetCookies.every((name) => name in foundCookies)
                if (allFound) {
                    return {
                        success: true,
                        cookies: cookieString,
                        targetCookies: foundCookies
                    }
                }
            } catch (error) {
                console.error('获取 Cookie 失败:', error)
            }
            return null
        }

        // 页面加载完成后检查
        cfWindow.webContents.on('did-finish-load', async () => {
            const result = await checkCookies()
            if (result) {
                if (cfWindow && !cfWindow.isDestroyed()) {
                    cfWindow.close()
                }
                resolve(result)
            }
        })

        // 监听 Cookie 变化事件
        windowSession.cookies.on('changed', async (_, cookie, cause) => {
            // 只关心目标 Cookie 的变化
            if (targetCookies.includes(cookie.name) && cause !== 'expired') {
                const result = await checkCookies()
                if (result) {
                    if (cfWindow && !cfWindow.isDestroyed()) {
                        cfWindow.close()
                    }
                    resolve(result)
                }
            }
        })

        // 窗口关闭时返回结果
        cfWindow.on('closed', async () => {
            cfWindow = null

            // 最后再检查一次 Cookie
            try {
                const cookies = await windowSession.cookies.get({ domain: urlObj.hostname })
                const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join('; ')

                // 获取目标 Cookie 键值对
                const foundCookies: Record<string, string> = {}
                for (const name of targetCookies) {
                    const cookie = cookies.find((c) => c.name === name)
                    if (cookie) {
                        foundCookies[name] = cookie.value
                    }
                }

                const hasAnyCookie = Object.keys(foundCookies).length > 0
                if (hasAnyCookie) {
                    resolve({
                        success: true,
                        cookies: cookieString,
                        targetCookies: foundCookies
                    })
                } else {
                    resolve({
                        success: false,
                        cookies: cookieString,
                        targetCookies: {},
                        error: '用户关闭了验证窗口'
                    })
                }
            } catch {
                resolve({
                    success: false,
                    cookies: '',
                    targetCookies: {},
                    error: '获取 Cookie 失败'
                })
            }
        })

        // 加载目标 URL
        cfWindow.loadURL(url)
    })
}
