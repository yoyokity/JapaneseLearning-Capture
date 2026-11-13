import { execFile, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { app, net } from 'electron'
import iconv from 'iconv-lite'

import { appPath } from '../globalStates'
import { downloadFile } from '../helper/download'

const REPO = 'yoyokity/JapaneseLearning-Capture'
/** 更新清单地址，走 GitHub 下载 CDN，不消耗 API 配额 */
const LATEST_MANIFEST_URL = `https://github.com/${REPO}/releases/latest/download/latest.json`
const DOWNLOAD_BASE = `https://github.com/${REPO}/releases/download`
const TOOLS_ASSET_PATTERN = /^JapLC-tools-(?<hash>[0-9a-f]{8})-x64\.7z$/
/** 未应用的更新保留时长，超过后清理以释放磁盘 */
const PENDING_UPDATE_MAX_AGE = 7 * 24 * 60 * 60 * 1000
const execFileAsync = promisify(execFile)

/**
 * 更新包资产
 */
export interface IUpdateAsset {
    /** 资产文件名 */
    name: string
    /** 下载地址 */
    url: string
    /** 文件大小（字节） */
    size: number
    /** 包的 sha256 */
    sha256: string
}

/**
 * 单个版本的更新说明
 */
export interface IReleaseNote {
    /** 版本号 */
    version: string
    /** 发布时间 */
    publishedAt: string
    /** 更新说明（markdown） */
    notes: string
}

/**
 * 检查到的更新信息
 */
export interface IUpdateInfo {
    /** 新版本号 */
    version: string
    /** 各版本说明，新版本在前 */
    releases: IReleaseNote[]
    /** 主程序更新包 */
    appAsset: IUpdateAsset
    /** tools 更新包，无需更新时为 null */
    toolsAsset: (IUpdateAsset & { hash: string }) | null
    /** 是否需要更新 tools */
    needTools: boolean
}

/**
 * 更新状态
 */
export type UpdateStatus = 'idle' | 'downloading' | 'extracting' | 'ready' | 'applying' | 'error'

/**
 * 更新状态快照
 */
export interface IUpdateState {
    /** 当前状态 */
    status: UpdateStatus
    /** 正在下载的包 */
    stage: 'app' | 'tools' | null
    /** 已下载字节数 */
    received: number
    /** 总字节数 */
    total: number
    /** 已下载完成、等待重启应用的版本 */
    targetVersion: string | null
    /** 错误信息 */
    error: string | null
}

/**
 * 更新清单（发布时生成的 latest.json）
 */
interface ILatestManifest {
    version: string
    tag: string
    date?: string
    notes?: string
    /** 各版本 tag，新版本在前 */
    versions?: string[]
    assets: {
        app: { name: string; size: number; sha256: string }
        tools: { name: string; size: number; sha256: string }
    }
}

/** 更新状态 */
let state: IUpdateState = {
    status: 'idle',
    stage: null,
    received: 0,
    total: 0,
    targetVersion: null,
    error: null
}
/** 状态订阅者 */
const stateListeners = new Set<(state: IUpdateState) => void>()
/** 最近一次检查结果，下载时用于校验版本，避免渲染层传入任意地址 */
let lastChecked: IUpdateInfo | null = null
/** 后台下载任务，防止重复启动 */
let downloadTask: Promise<void> | null = null
/** 上次更新失败的原因 */
let lastUpdateError: string | null = null

/**
 * 更新目录，不能放在 temp（退出时会被清空）
 * @remark 必须在函数内获取，模块初始化时 app.setPath 尚未执行
 */
function getUpdateDir() {
    return join(app.getPath('userData'), 'update')
}

/**
 * 开发模式下 exe 指向 Electron 自身，更新会破坏本地运行环境
 */
function assertPackaged() {
    if (!app.isPackaged) {
        throw new Error('开发模式不支持更新')
    }
}

/**
 * 转义 bat 中的路径，cmd 会把 % 当作变量展开
 */
function escapeBatPath(value: string) {
    return value.replace(/%/g, '%%')
}

/**
 * 获取随包携带的解压器路径
 */
function getSevenZipPath() {
    return join(appPath.extraResource, '7za.exe')
}

/**
 * 读取本地 tools 版本标记
 */
function readLocalToolsHash() {
    try {
        return readFileSync(join(appPath.extraResource, 'tools', '.version'), 'utf8').trim()
    } catch {
        return ''
    }
}

/**
 * 比较两个版本号
 * @returns 正数表示 a 大于 b
 */
function compareVersion(a: string, b: string) {
    const parse = (version: string) => {
        const [core = '0', prerelease] = version.split('-')
        return { numbers: core.split('.').map(Number), prerelease }
    }
    const left = parse(a)
    const right = parse(b)

    for (let index = 0; index < 3; index++) {
        const diff = (left.numbers[index] ?? 0) - (right.numbers[index] ?? 0)
        if (diff !== 0) return diff
    }

    // 主版本号相同时，正式版高于预发布版
    if (!left.prerelease && right.prerelease) return 1
    if (left.prerelease && !right.prerelease) return -1
    return 0
}

/**
 * 更新状态并通知订阅者
 */
function setState(patch: Partial<IUpdateState>) {
    state = { ...state, ...patch }
    for (const listener of stateListeners) {
        listener(state)
    }
}

/**
 * 获取更新状态快照
 */
export function getUpdateState() {
    return state
}

/**
 * 订阅更新状态变化
 * @returns 取消订阅函数
 */
export function onUpdateStateChange(listener: (state: IUpdateState) => void) {
    stateListeners.add(listener)
    return () => {
        stateListeners.delete(listener)
    }
}

/** 下载指定版本清单 */
async function fetchReleaseNote(tag: string): Promise<IReleaseNote | null> {
    // 只接受标准版本号
    if (!/^\d+\.\d+\.\d+$/.test(tag)) return null

    try {
        const response = await net.fetch(`${DOWNLOAD_BASE}/${tag}/latest.json`, {
            signal: AbortSignal.timeout(15_000)
        })
        if (!response.ok) return null

        const manifest = (await response.json()) as ILatestManifest
        // 版本必须一致
        if (manifest.version !== tag) return null

        return {
            version: manifest.version,
            publishedAt: manifest.date ?? '',
            notes: manifest.notes ?? ''
        }
    } catch {
        return null
    }
}

/**
 * 检查更新清单中的最新版本
 */
export async function checkUpdate(): Promise<IUpdateInfo | null> {
    const response = await net.fetch(LATEST_MANIFEST_URL, {
        signal: AbortSignal.timeout(15_000)
    })
    // 最新 release 尚未附带清单时视为无更新
    if (response.status === 404) return null
    if (!response.ok) {
        throw new Error(`获取更新清单失败（${response.status}）`)
    }

    const manifest = (await response.json()) as ILatestManifest
    if (!manifest.version || !manifest.tag || !manifest.assets?.app) {
        throw new Error('更新清单格式无效')
    }
    if (compareVersion(manifest.version, app.getVersion()) <= 0) return null

    const { app: appAsset, tools: toolsAsset } = manifest.assets
    if (!appAsset?.name || !appAsset.sha256) {
        throw new Error('更新清单格式无效')
    }

    const downloadUrl = (name: string) => `${DOWNLOAD_BASE}/${manifest.tag}/${name}`

    const toolsMatch = TOOLS_ASSET_PATTERN.exec(toolsAsset?.name ?? '')
    const { hash: remoteToolsHash = '' } = toolsMatch?.groups ?? {}
    const needTools = Boolean(toolsMatch) && remoteToolsHash !== readLocalToolsHash()

    // 最新取自清单，其余逐个下载
    const versions = [...new Set([manifest.version, ...(manifest.versions ?? [])])]
        .filter((tag) => compareVersion(tag, app.getVersion()) > 0)
        .sort((a, b) => compareVersion(b, a))
    const releases = (
        await Promise.all(
            versions.map((tag) =>
                tag === manifest.version
                    ? {
                          version: tag,
                          publishedAt: manifest.date ?? '',
                          notes: manifest.notes ?? ''
                      }
                    : fetchReleaseNote(tag)
            )
        )
    ).filter((item): item is IReleaseNote => item !== null)

    lastChecked = {
        version: manifest.version,
        releases,
        appAsset: {
            name: appAsset.name,
            url: downloadUrl(appAsset.name),
            size: appAsset.size,
            sha256: appAsset.sha256
        },
        toolsAsset:
            needTools && toolsMatch && toolsAsset
                ? {
                      name: toolsAsset.name,
                      url: downloadUrl(toolsAsset.name),
                      size: toolsAsset.size,
                      sha256: toolsAsset.sha256,
                      hash: remoteToolsHash
                  }
                : null,
        needTools
    }

    return lastChecked
}

/**
 * 下载更新包并把进度同步到更新状态
 * @returns 下载完成的文件路径
 */
async function downloadUpdateAsset(asset: IUpdateAsset, stage: IUpdateState['stage']) {
    setState({ status: 'downloading', stage, received: 0, total: asset.size, error: null })

    return downloadFile({
        url: asset.url,
        size: asset.size,
        sha256: asset.sha256,
        targetPath: join(getUpdateDir(), asset.name),
        onProgress: (received) => setState({ received })
    })
}

/**
 * 解压 7z 包
 */
async function extractArchive(archivePath: string, targetDir: string) {
    await execFileAsync(getSevenZipPath(), ['x', '-y', `-o${targetDir}`, archivePath], {
        windowsHide: true
    })
}

/**
 * 开始下载更新包，下载与解压在后台进行，进度通过状态订阅推送
 * @param version 渲染层检查到的版本号，用于确认使用最近一次检查结果
 */
export async function startDownload(version: string) {
    assertPackaged()
    if (downloadTask) return

    if (!lastChecked || lastChecked.version !== version) {
        lastChecked = await checkUpdate()
    }
    // 检查期间可能已有下载启动
    if (downloadTask) return

    const info = lastChecked
    if (!info || info.version !== version) {
        throw new Error('更新信息已失效，请重新检查更新')
    }

    const updateDir = getUpdateDir()
    mkdirSync(updateDir, { recursive: true })
    // 保留 .part 以便断点续传，只清理上次的解压产物
    rmSync(join(updateDir, 'staging'), { recursive: true, force: true })

    downloadTask = (async () => {
        try {
            // 解压器随主程序包分发，缺失说明安装目录不完整
            if (!existsSync(getSevenZipPath())) {
                throw new Error('缺少解压组件，请手动下载最新版本')
            }

            const appArchive = await downloadUpdateAsset(info.appAsset, 'app')
            const toolsArchive =
                info.needTools && info.toolsAsset
                    ? await downloadUpdateAsset(info.toolsAsset, 'tools')
                    : ''

            setState({ status: 'extracting', stage: null, received: 0, total: 0 })
            await extractArchive(appArchive, join(updateDir, 'staging', 'app'))
            if (toolsArchive) {
                await extractArchive(toolsArchive, join(updateDir, 'staging', 'tools'))
            }

            rmSync(appArchive, { force: true })
            if (toolsArchive) rmSync(toolsArchive, { force: true })

            // 记录目标版本，重启后据此判断更新是否已生效
            writeFileSync(join(updateDir, 'ready'), info.version)
            setState({ status: 'ready', stage: null, targetVersion: info.version })
        } catch (error) {
            setState({
                status: 'error',
                stage: null,
                error: error instanceof Error ? error.message : String(error)
            })
        } finally {
            downloadTask = null
        }
    })()
}

/**
 * 生成替换脚本并退出应用，脚本在进程退出后覆盖安装目录并重启
 */
export async function applyUpdate() {
    assertPackaged()
    if (state.status !== 'ready') {
        throw new Error('更新尚未准备完成')
    }

    const installDir = dirname(app.getPath('exe'))
    const exePath = app.getPath('exe')
    const updateDir = getUpdateDir()
    const stagingApp = join(updateDir, 'staging', 'app', 'JapLC')
    const stagingTools = join(updateDir, 'staging', 'tools', 'JapLC', 'resources', 'tools')
    const toolsTarget = join(installDir, 'resources', 'tools')
    const errorLogPath = join(updateDir, 'update-error.log')

    if (!existsSync(stagingApp)) {
        // 文件被外部清理后重置状态，允许用户重新下载
        setState({ status: 'idle', stage: null, targetVersion: null })
        throw new Error('更新文件不完整，请重新下载')
    }

    const lines = [
        '@echo off',
        // 等待主进程退出并释放文件占用
        'ping 127.0.0.1 -n 4 >nul',
        `robocopy "${escapeBatPath(stagingApp)}" "${escapeBatPath(installDir)}" /MIR /XD "${escapeBatPath(join(installDir, 'data'))}" "${escapeBatPath(toolsTarget)}" /R:5 /W:2 /NFL /NDL /NJH /NJS`,
        'if errorlevel 8 goto failed'
    ]
    if (existsSync(stagingTools)) {
        lines.push(
            `robocopy "${escapeBatPath(stagingTools)}" "${escapeBatPath(toolsTarget)}" /MIR /R:5 /W:2 /NFL /NDL /NJH /NJS`,
            'if errorlevel 8 goto failed'
        )
    }
    lines.push(
        `start "" "${escapeBatPath(exePath)}"`,
        'exit 0',
        ':failed',
        `echo 更新文件替换失败（错误码 %errorlevel%），安装目录可能不完整，请手动下载最新版本 > "${escapeBatPath(errorLogPath)}"`,
        `start "" "${escapeBatPath(exePath)}"`,
        'exit 0'
    )

    const batPath = join(updateDir, 'apply.bat')
    // cmd 按系统代码页解析 bat，含中文路径时必须以 GBK 写入
    writeFileSync(batPath, iconv.encode(lines.join('\r\n'), 'gbk'))

    setState({ status: 'applying' })
    spawn('cmd.exe', ['/c', 'start', '', '/min', batPath], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
    }).unref()
    app.exit(0)
}

/**
 * 读取上次更新失败的原因并清除标记
 * @remark 需在清理更新目录之前调用
 */
export function consumeUpdateError() {
    const errorPath = join(getUpdateDir(), 'update-error.log')

    try {
        lastUpdateError = iconv.decode(readFileSync(errorPath), 'gbk').trim() || null
        rmSync(errorPath, { force: true })
    } catch {
        lastUpdateError = null
    }
}

/**
 * 获取上次更新失败的原因
 */
export function getUpdateError() {
    return lastUpdateError
}

/**
 * 恢复已下载完成但未应用的更新，否则清理残留
 * @remark 标记中的版本与当前版本相同，说明上次更新已生效
 */
export function restorePendingUpdate() {
    const updateDir = getUpdateDir()
    const stagingApp = join(updateDir, 'staging', 'app', 'JapLC')
    const readyPath = join(updateDir, 'ready')

    try {
        const targetVersion = readFileSync(readyPath, 'utf8').trim()
        const expired = Date.now() - statSync(readyPath).mtimeMs > PENDING_UPDATE_MAX_AGE
        if (targetVersion !== app.getVersion() && existsSync(stagingApp) && !expired) {
            state = { ...state, status: 'ready', targetVersion }
            return
        }
    } catch {}

    clearUpdateDir()
}

/**
 * 清理上次更新残留的下载与解压文件
 */
export function clearUpdateDir() {
    try {
        rmSync(getUpdateDir(), { recursive: true, force: true })
    } catch {}
}
