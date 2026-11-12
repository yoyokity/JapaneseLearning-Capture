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
    truncateSync,
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
/** 分块下载并发数，实测 8 路可跑满带宽 */
const DOWNLOAD_CONNECTIONS = 8
/** 每个分块的大小 */
const DOWNLOAD_BLOCK_SIZE = 8 * 1024 * 1024
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
 * 分块下载状态，保存在 .part.json 中用于断点续传
 */
interface IPartState {
    /** 文件总大小 */
    size: number
    /** 每块已写入字节数 */
    received: number[]
}

/**
 * 获取分块的范围
 * @param index 分块下标
 * @param size 文件总大小
 */
function getBlockRange(index: number, size: number) {
    const start = index * DOWNLOAD_BLOCK_SIZE
    const end = Math.min(start + DOWNLOAD_BLOCK_SIZE, size)
    return { start, end, length: end - start }
}

/**
 * 计算文件的 sha256
 */
async function hashFile(filePath: string) {
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(filePath)) {
        hash.update(chunk)
    }

    return hash.digest('hex')
}

/**
 * 下载单个资产，使用多连接分块与断点续传
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
    const statePath = `${partPath}.json`
    const blockCount = Math.ceil(asset.size / DOWNLOAD_BLOCK_SIZE)

    /**
     * 创建全新的分块状态，预分配文件
     */
    function createPartState(): IPartState {
        rmSync(partPath, { force: true })
        writeFileSync(partPath, '')
        truncateSync(partPath, asset.size)
        const nextState: IPartState = {
            size: asset.size,
            received: Array.from({ length: blockCount }).fill(0) as number[]
        }
        writeFileSync(statePath, JSON.stringify(nextState))
        return nextState
    }

    /**
     * 读取上次未完成的分块状态，文件大小不一致时返回 null
     */
    function readPartState(): IPartState | null {
        try {
            const saved = JSON.parse(readFileSync(statePath, 'utf8')) as IPartState
            if (saved.size === asset.size && statSync(partPath).size === asset.size) {
                return saved
            }
        } catch {}

        return null
    }

    const state = readPartState() ?? createPartState()
    let lastEmitTime = 0
    let lastSaveTime = Date.now()

    /**
     * 保存断点状态
     */
    function saveState() {
        try {
            writeFileSync(statePath, JSON.stringify(state))
        } catch {}
    }

    /**
     * 汇总各分块进度并推送
     */
    function emitProgress(force = false) {
        const now = Date.now()
        if (!force && now - lastEmitTime < 200) return
        lastEmitTime = now

        const received = state.received.reduce((sum, value) => sum + value, 0)
        setState({ received })
        if (now - lastSaveTime >= 2000) {
            lastSaveTime = now
            saveState()
        }
    }

    /**
     * 下载单个分块，从该块已写入位置继续
     */
    async function downloadBlock(index: number) {
        const { start, end } = getBlockRange(index, asset.size)
        const offset = start + (state.received[index] ?? 0)
        if (offset >= end) return

        const response = await net.fetch(asset.url, {
            redirect: 'follow',
            headers: { Range: `bytes=${offset}-${end - 1}` },
            signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT)
        })
        if (response.status !== 206 || !response.body) {
            throw new Error(`分块下载失败（${response.status}）`)
        }

        const file = createWriteStream(partPath, { flags: 'r+', start: offset })
        const reader = response.body.getReader()

        try {
            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                if (!file.write(value)) {
                    await once(file, 'drain')
                }
                state.received[index] = (state.received[index] ?? 0) + value.byteLength
                emitProgress()
            }
        } finally {
            file.end()
            // 等文件句柄释放后再继续，避免 Windows 上文件被占用
            await finished(file).catch(() => {})
        }
    }

    /**
     * 下载分块并重试
     */
    async function downloadBlockWithRetry(index: number) {
        let lastError: unknown = null
        for (let attempt = 0; attempt <= MAX_DOWNLOAD_RETRIES; attempt++) {
            if (attempt > 0) {
                await new Promise((resolve) => setTimeout(resolve, 2000 * attempt))
            }
            try {
                await downloadBlock(index)
                return
            } catch (error) {
                lastError = error
            }
        }

        throw lastError instanceof Error ? lastError : new Error(String(lastError))
    }

    // 只调度未完成的分块，多个 worker 并发领取
    const pendingBlocks: number[] = []
    for (let index = 0; index < blockCount; index++) {
        const { length } = getBlockRange(index, asset.size)
        if ((state.received[index] ?? 0) < length) {
            pendingBlocks.push(index)
        }
    }

    setState({
        status: 'downloading',
        stage,
        received: state.received.reduce((sum, value) => sum + value, 0),
        total: asset.size,
        error: null
    })

    try {
        await Promise.all(
            Array.from(
                { length: Math.min(DOWNLOAD_CONNECTIONS, pendingBlocks.length) },
                async () => {
                    while (pendingBlocks.length > 0) {
                        const index = pendingBlocks.shift()
                        if (index === undefined) break
                        await downloadBlockWithRetry(index)
                    }
                }
            )
        )
    } catch (error) {
        saveState()
        throw error
    }

    saveState()
    setState({ received: asset.size })

    if ((await hashFile(partPath)) !== asset.sha256) {
        rmSync(partPath, { force: true })
        rmSync(statePath, { force: true })
        throw new Error('更新包校验失败，请重新下载')
    }

    renameSync(partPath, targetPath)
    rmSync(statePath, { force: true })
    return targetPath
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
