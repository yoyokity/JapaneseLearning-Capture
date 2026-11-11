import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import {
    createReadStream,
    createWriteStream,
    existsSync,
    mkdirSync,
    readFileSync,
    renameSync,
    rmSync,
    statSync,
    writeFileSync
} from 'node:fs'
import { dirname, join } from 'node:path'
import { finished } from 'node:stream/promises'
import { promisify } from 'node:util'
import { app, net } from 'electron'
import iconv from 'iconv-lite'

import { appPath } from '../globalStates'

const REPO = 'yoyokity/JapaneseLearning-Capture'
/** 更新清单地址，走 GitHub 下载 CDN，不消耗 API 配额 */
const LATEST_MANIFEST_URL = `https://github.com/${REPO}/releases/latest/download/latest.json`
const DOWNLOAD_BASE = `https://github.com/${REPO}/releases/download`
const TOOLS_ASSET_PATTERN = /^JapLC-tools-(?<hash>[0-9a-f]{8})-x64\.7z$/
/** 下载超时，大包下载不能使用短超时 */
const DOWNLOAD_TIMEOUT = 30 * 60 * 1000
/** 下载中断后的最大重试次数 */
const MAX_DOWNLOAD_RETRIES = 3
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
 * 检查到的更新信息
 */
export interface IUpdateInfo {
    /** 新版本号 */
    version: string
    /** 更新日志（markdown） */
    notes: string
    /** 发布时间 */
    publishedAt: string
    /** 主程序更新包 */
    appAsset: IUpdateAsset
    /** tools 更新包，无需更新时为 null */
    toolsAsset: (IUpdateAsset & { hash: string }) | null
    /** 是否需要更新 tools */
    needTools: boolean
    /** 解压器资产，本地已有解压器时为 null（旧版本升级时首次需要） */
    sevenZipAsset: IUpdateAsset | null
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
    stage: 'app' | 'tools' | 'sevenZip' | null
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
    assets: {
        app: { name: string; size: number; sha256: string }
        tools: { name: string; size: number; sha256: string }
        sevenZip: { name: string; size: number; sha256: string }
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
 * 获取解压器路径，优先使用包内自带的；旧版本没有自带时使用首次更新下载的那份
 */
function getSevenZipPath() {
    const bundledPath = join(appPath.extraResource, '7za.exe')
    if (existsSync(bundledPath)) return bundledPath

    return join(app.getPath('userData'), '7za.exe')
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

    const { app: appAsset, tools: toolsAsset, sevenZip: sevenZipAsset } = manifest.assets
    if (!appAsset?.name || !appAsset.sha256) {
        throw new Error('更新清单格式无效')
    }

    const downloadUrl = (name: string) => `${DOWNLOAD_BASE}/${manifest.tag}/${name}`

    const toolsMatch = TOOLS_ASSET_PATTERN.exec(toolsAsset?.name ?? '')
    const { hash: remoteToolsHash = '' } = toolsMatch?.groups ?? {}
    const needTools = Boolean(toolsMatch) && remoteToolsHash !== readLocalToolsHash()
    const hasSevenZip = existsSync(getSevenZipPath())

    lastChecked = {
        version: manifest.version,
        notes: manifest.notes ?? '',
        publishedAt: manifest.date ?? '',
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
        needTools,
        sevenZipAsset:
            hasSevenZip || !sevenZipAsset?.name
                ? null
                : {
                      name: sevenZipAsset.name,
                      url: downloadUrl(sevenZipAsset.name),
                      size: sevenZipAsset.size,
                      sha256: sevenZipAsset.sha256
                  }
    }

    return lastChecked
}

/**
 * 读取已下载部分的位置与 hash，用于断点续传
 * @remark 以文件实际内容为准，避免上次写入未落盘导致 hash 与文件不一致
 */
async function readPartialState(partPath: string) {
    if (!existsSync(partPath)) {
        return { received: 0, hash: createHash('sha256') }
    }

    const received = statSync(partPath).size
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(partPath)) {
        hash.update(chunk)
    }

    return { received, hash }
}

/**
 * 下载单个资产，支持断点续传与自动重试，边下载边校验 sha256
 * @returns 下载完成的文件路径
 */
async function downloadAsset(
    asset: IUpdateAsset,
    stage: IUpdateState['stage'],
    targetPath: string = join(getUpdateDir(), asset.name)
) {
    if (!asset.sha256) {
        throw new Error('更新包缺少校验信息，已终止更新')
    }

    const partPath = `${targetPath}.part`

    let lastError: unknown = null

    for (let attempt = 0; attempt <= MAX_DOWNLOAD_RETRIES; attempt++) {
        if (attempt > 0) {
            // 退避等待，避免瞬时网络抖动时连续失败
            await new Promise((resolve) => setTimeout(resolve, 2000 * attempt))
        }

        let { received, hash } = await readPartialState(partPath)

        try {
            const headers: HeadersInit = received > 0 ? { Range: `bytes=${received}-` } : {}

            const response = await net.fetch(asset.url, {
                redirect: 'follow',
                headers,
                signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT)
            })
            if (!response.ok || !response.body) {
                // 断点位置无效时丢弃已下载部分，下次从零开始
                if (response.status === 416) {
                    rmSync(partPath, { force: true })
                }
                throw new Error(`下载失败（${response.status}）`)
            }

            // 服务器不支持断点续传时返回 200，只能从头开始
            if (received > 0 && response.status !== 206) {
                rmSync(partPath, { force: true })
                received = 0
                hash = createHash('sha256')
            }

            const contentLength = Number(response.headers.get('content-length')) || 0
            const total = contentLength > 0 ? received + contentLength : asset.size
            const file = createWriteStream(partPath, { flags: received > 0 ? 'a' : 'w' })
            const reader = response.body.getReader()
            let lastEmitTime = 0

            setState({ status: 'downloading', stage, received, total, error: null })

            try {
                while (true) {
                    const { done, value } = await reader.read()
                    if (done) break

                    hash.update(value)
                    received += value.byteLength
                    if (!file.write(value)) {
                        await once(file, 'drain')
                    }

                    const now = Date.now()
                    if (now - lastEmitTime >= 200) {
                        lastEmitTime = now
                        setState({ received })
                    }
                }
            } finally {
                file.end()
                // 等文件句柄释放后再重试，避免 Windows 上文件被占用
                await finished(file).catch(() => {})
            }

            if (hash.digest('hex') !== asset.sha256) {
                // 文件损坏，丢弃后重新下载
                rmSync(partPath, { force: true })
                throw new Error('更新包校验失败，请重新下载')
            }

            renameSync(partPath, targetPath)
            setState({ received: total })
            return targetPath
        } catch (error) {
            lastError = error
            // 保留已下载的部分，下次重试从断点继续
        }
    }

    rmSync(partPath, { force: true })
    throw lastError instanceof Error ? lastError : new Error(String(lastError))
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
            // 旧版本包里没有解压器，首次更新需要先下载
            if (!existsSync(getSevenZipPath())) {
                if (!info.sevenZipAsset) {
                    throw new Error('缺少解压组件，请重新检查更新')
                }
                await downloadAsset(info.sevenZipAsset, 'sevenZip', getSevenZipPath())
            }

            const appArchive = await downloadAsset(info.appAsset, 'app')
            const toolsArchive =
                info.needTools && info.toolsAsset
                    ? await downloadAsset(info.toolsAsset, 'tools')
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
