import { resolve } from 'node:path'
import { BrowserWindow, session } from 'electron'

/**
 * Cloudflare 验证结果
 */
export interface IVerifyCookies {
    /**
     * 是否验证成功
     */
    success: boolean
    /**
     * Cookie 字符串
     */
    cookies: string
    /**
     * 获取到的目标 Cookie 键值对
     */
    targetCookies: Record<string, string>
    /**
     * 错误信息
     */
    error?: string
}

const iconPath = resolve(import.meta.dirname, '../../resources/mainIcon.png')

let cfWindow: BrowserWindow | null = null

/**
 * 打开 Cloudflare 验证窗口
 * @param url 需要验证的网站 URL
 * @param targetCookies 目标 Cookie 名称数组，检测到所有 Cookie 后自动关闭窗口
 * @returns 返回验证结果，包含 Cookie 信息
 */
export async function openCloudflareWindow(
    url: string,
    targetCookies: string[] = ['XSRF-TOKEN'],
    userAgent?: string
): Promise<IVerifyCookies> {
    // 清理旧 Cookie，避免把失效的旧值当成验证成功
    await Promise.all(
        targetCookies.map((name) =>
            session.defaultSession.cookies.remove(url, name).catch(() => {})
        )
    )

    return new Promise((resolve) => {
        // 如果已有窗口，先关闭
        if (cfWindow && !cfWindow.isDestroyed()) {
            cfWindow.close()
        }

        const window = new BrowserWindow({
            width: 600,
            height: 700,
            icon: iconPath,
            autoHideMenuBar: true,
            webPreferences: {
                contextIsolation: true,
                sandbox: true
            }
        })
        cfWindow = window

        window.menuBarVisible = false

        // 反爬 cookie 会绑定 User-Agent，校验窗口必须和后续请求使用同一个 UA，
        // 否则会出现“验证成功但重试仍返回校验页”的情况。
        if (userAgent) window.webContents.setUserAgent(userAgent)

        // 获取窗口的 session
        const windowSession = window.webContents.session

        // 从 URL 提取域名
        const urlObj = new URL(url)

        let settled = false

        /**
         * 获取指定域名下的 Cookie
         */
        async function getCookies() {
            const cookies = await windowSession.cookies.get({ domain: urlObj.hostname })
            const cookieString = cookies
                .map((cookie) => `${cookie.name}=${cookie.value}`)
                .join('; ')
            const foundCookies: Record<string, string> = {}

            for (const name of targetCookies) {
                const cookie = cookies.find((item) => item.name === name)
                if (cookie) foundCookies[name] = cookie.value
            }

            return { cookieString, foundCookies }
        }

        /**
         * 结束验证
         */
        function finish(result: IVerifyCookies) {
            if (settled) return

            settled = true
            windowSession.cookies.removeListener('changed', onCookieChanged)
            if (!window.isDestroyed()) window.close()
            resolve(result)
        }

        /**
         * 检查目标 Cookie 是否齐全
         */
        async function checkCookies() {
            if (settled || window.isDestroyed()) return

            try {
                const { cookieString, foundCookies } = await getCookies()
                if (targetCookies.every((name) => name in foundCookies)) {
                    finish({
                        success: true,
                        cookies: cookieString,
                        targetCookies: foundCookies
                    })
                }
            } catch (error) {
                console.error('获取 Cookie 失败:', error)
            }
        }

        /**
         * 监听 Cookie 变化
         */
        function onCookieChanged(_: unknown, cookie: Electron.Cookie, cause: string) {
            if (targetCookies.includes(cookie.name) && cause !== 'expired') {
                void checkCookies()
            }
        }

        // 页面加载完成后检查
        window.webContents.on('did-finish-load', () => void checkCookies())

        // 监听 Cookie 变化事件
        windowSession.cookies.on('changed', onCookieChanged)

        // 窗口关闭时返回结果
        window.on('closed', () => {
            if (cfWindow === window) cfWindow = null
            if (settled) return

            settled = true
            windowSession.cookies.removeListener('changed', onCookieChanged)

            void getCookies()
                .then(({ cookieString, foundCookies }) => {
                    const allFound = targetCookies.every((name) => name in foundCookies)
                    resolve(
                        allFound
                            ? {
                                  success: true,
                                  cookies: cookieString,
                                  targetCookies: foundCookies
                              }
                            : {
                                  success: false,
                                  cookies: cookieString,
                                  targetCookies: foundCookies,
                                  error: '用户关闭了验证窗口'
                              }
                    )
                })
                .catch(() => {
                    resolve({
                        success: false,
                        cookies: '',
                        targetCookies: {},
                        error: '获取 Cookie 失败'
                    })
                })
        })

        // 加载目标 URL
        void window.loadURL(url)
    })
}
