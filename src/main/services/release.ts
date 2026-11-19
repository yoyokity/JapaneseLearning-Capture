import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { net } from 'electron'

import { appPath } from '../globalStates'

const execFileAsync = promisify(execFile)

const REPO = 'yoyokity/JapaneseLearning-Capture'
/** 更新清单地址，走 GitHub 下载 CDN，不消耗 API 配额 */
const LATEST_MANIFEST_URL = `https://github.com/${REPO}/releases/latest/download/latest.json`
/** 发布资产下载根地址 */
export const DOWNLOAD_BASE = `https://github.com/${REPO}/releases/download`
/** 清单缓存时长（毫秒） */
const MANIFEST_CACHE_TTL = 5_000

/**
 * 更新清单（发布时生成的 latest.json）
 */
export interface ILatestManifest {
    version: string
    tag: string
    date?: string
    notes?: string
    /** 各版本 tag，新版本在前 */
    versions?: string[]
    assets: {
        app: { name: string; size: number; sha256: string }
        /** 统一工具包 */
        tools?: { name: string; size: number; sha256: string; version: string }
        /** 官网直下的依赖，目前只有字幕 */
        dependencies?: Record<string, { version?: string }>
    }
}

/** 清单缓存 */
let manifestCache: { time: number; promise: Promise<ILatestManifest | null> } | null = null

/**
 * 获取随包携带的解压器路径
 */
export function getSevenZipPath() {
    return join(appPath.extraResource, '7za.exe')
}

/**
 * 解压 7z 包
 */
export async function extractArchive(archivePath: string, targetDir: string) {
    await execFileAsync(getSevenZipPath(), ['x', '-y', `-o${targetDir}`, archivePath], {
        windowsHide: true
    })
}

/**
 * 请求最新清单，短时缓存
 * @returns 清单，404 表示暂无
 */
export function fetchLatestManifest(): Promise<ILatestManifest | null> {
    if (manifestCache && Date.now() - manifestCache.time < MANIFEST_CACHE_TTL) {
        return manifestCache.promise
    }

    const promise = requestLatestManifest()
    manifestCache = { time: Date.now(), promise }
    // 失败不缓存
    void promise.catch(() => {
        manifestCache = null
    })

    return promise
}

/**
 * 请求最新清单
 */
async function requestLatestManifest(): Promise<ILatestManifest | null> {
    const response = await net.fetch(LATEST_MANIFEST_URL, {
        signal: AbortSignal.timeout(15_000)
    })
    // 最新 release 尚未附带清单时视为无更新
    if (response.status === 404) return null
    if (!response.ok) {
        throw new Error(`获取更新清单失败（${response.status}）`)
    }

    return (await response.json()) as ILatestManifest
}
