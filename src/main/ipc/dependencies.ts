import type { ILatestManifest } from './update'

import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { app } from 'electron'

import { appPath } from '../globalStates'
import { downloadFile } from '../helper/download'
import { DOWNLOAD_BASE, fetchLatestManifest, getSevenZipPath } from './update'

const execFileAsync = promisify(execFile)
/** 依赖包名格式 */
const DEPENDENCY_ASSET_PATTERN = /^JapLC-dep-(?<id>[a-z-]+)-(?<hash>[0-9a-f]{8})-x64\.7z$/

/**
 * 依赖定义
 */
export interface IDependencyDefinition {
    /** tools 目录名 */
    id: string
    /** 展示名称 */
    name: string
    /** 功能说明 */
    description: string
    /** 安装检测文件 */
    files: string[]
    /** 是否必需 */
    required: boolean
}

/** 应用依赖的工具 */
const DEPENDENCIES: IDependencyDefinition[] = [
    {
        id: 'ffmpeg',
        name: 'FFmpeg',
        description: '音频重编码',
        files: ['ffmpeg.exe'],
        required: true
    },
    {
        id: 'image-polish',
        name: 'Image Polish',
        description: '图片超分辨率',
        files: ['imagepolish.exe', 'onnxruntime.dll', 'DirectML.dll'],
        required: true
    },
    {
        id: 'mediainfo',
        name: 'MediaInfo',
        description: '读取媒体信息',
        files: ['MediaInfo.exe', 'LIBCURL.DLL'],
        required: true
    }
]

/**
 * 依赖信息
 */
export interface IDependencyInfo extends IDependencyDefinition {
    /** 是否已安装 */
    installed: boolean
    /** 本地版本，未知为空 */
    version: string
    /** 最新版本，未知为空 */
    latestVersion: string
    /** 是否可更新 */
    updateAvailable: boolean
    /** 下载大小，未知为 0 */
    size: number
}

/**
 * 依赖列表
 */
export interface IDependencyList {
    /** 各依赖信息 */
    items: IDependencyInfo[]
    /** 远端信息是否可用 */
    remoteOk: boolean
}

/** 安装状态 */
export type DependencyInstallStatus = 'idle' | 'downloading' | 'extracting' | 'done' | 'error'

/**
 * 安装状态快照
 */
export interface IDependencyState {
    /** 安装中依赖 id */
    id: string | null
    /** 当前状态 */
    status: DependencyInstallStatus
    /** 已下载字节数 */
    received: number
    /** 总字节数 */
    total: number
    /** 错误信息 */
    error: string | null
}

/** 当前安装状态 */
let state: IDependencyState = {
    id: null,
    status: 'idle',
    received: 0,
    total: 0,
    error: null
}
/** 状态订阅者 */
const stateListeners = new Set<(state: IDependencyState) => void>()
/** 后台安装任务 */
let installTask: Promise<void> | null = null

/**
 * 依赖目录
 */
function getToolsDir() {
    return join(appPath.extraResource, 'tools')
}

/**
 * 读取本地版本
 * @param id 依赖 id
 */
function readLocalVersion(id: string) {
    try {
        return readFileSync(join(getToolsDir(), id, '.version'), 'utf8').trim()
    } catch {
        return ''
    }
}

/**
 * 检查依赖是否完整
 * @param dependency 依赖定义
 */
function isInstalled(dependency: IDependencyDefinition) {
    return dependency.files.every((file) => existsSync(join(getToolsDir(), dependency.id, file)))
}

/**
 * 更新状态并通知
 * @param patch 状态补丁
 */
function setState(patch: Partial<IDependencyState>) {
    state = { ...state, ...patch }
    for (const listener of stateListeners) {
        listener(state)
    }
}

/**
 * 获取安装状态
 */
export function getDependencyState() {
    return state
}

/**
 * 订阅安装状态
 * @param listener 状态回调
 * @returns 取消订阅函数
 */
export function onDependencyStateChange(listener: (state: IDependencyState) => void) {
    stateListeners.add(listener)
    return () => {
        stateListeners.delete(listener)
    }
}

/**
 * 获取本地依赖状态
 */
export function getLocalDependencies(): IDependencyInfo[] {
    return DEPENDENCIES.map((dependency) => ({
        ...dependency,
        installed: isInstalled(dependency),
        version: readLocalVersion(dependency.id),
        latestVersion: '',
        updateAvailable: false,
        size: 0
    }))
}

/**
 * 获取依赖状态
 */
export async function getDependencies(): Promise<IDependencyList> {
    let manifest: ILatestManifest | null = null
    // 开发模式使用本地 tools
    if (app.isPackaged) {
        try {
            manifest = await fetchLatestManifest()
        } catch {
            // 网络异常时用本地状态
        }
    }

    const dependencies = manifest?.assets?.dependencies
    const items = getLocalDependencies().map((item) => {
        const asset = dependencies?.[item.id]
        // 从包名取版本
        const { hash = '' } = DEPENDENCY_ASSET_PATTERN.exec(asset?.name ?? '')?.groups ?? {}

        return {
            ...item,
            latestVersion: hash,
            // 版本未知时不提示更新
            updateAvailable: Boolean(item.version && hash && item.version !== hash),
            size: asset?.size ?? 0
        }
    })

    return {
        items,
        // 开发模式视为可用
        remoteOk:
            !app.isPackaged ||
            DEPENDENCIES.every((dependency) => Boolean(dependencies?.[dependency.id]))
    }
}

/**
 * 安装依赖
 * @param id 依赖 id
 */
export async function installDependency(id: string) {
    if (!app.isPackaged) {
        throw new Error('开发模式不支持下载依赖')
    }
    if (installTask) {
        throw new Error('正在安装其他依赖，请稍候')
    }

    const dependency = DEPENDENCIES.find((item) => item.id === id)
    if (!dependency) {
        throw new Error('未知依赖')
    }

    installTask = (async () => {
        try {
            // 解压器缺失
            if (!existsSync(getSevenZipPath())) {
                throw new Error('缺少解压组件，请手动下载最新版本')
            }

            const manifest = await fetchLatestManifest()
            const asset = manifest?.assets?.dependencies?.[id]
            const { id: assetId = '', hash = '' } =
                DEPENDENCY_ASSET_PATTERN.exec(asset?.name ?? '')?.groups ?? {}
            if (!manifest || !asset || !hash || assetId !== id) {
                throw new Error('依赖信息已失效，请重新检查')
            }

            const depsDir = join(app.getPath('userData'), 'dependency')
            mkdirSync(depsDir, { recursive: true })
            setState({ id, status: 'downloading', received: 0, total: asset.size, error: null })

            const archivePath = await downloadFile({
                url: `${DOWNLOAD_BASE}/${manifest.tag}/${asset.name}`,
                size: asset.size,
                sha256: asset.sha256,
                targetPath: join(depsDir, asset.name),
                onProgress: (received) => setState({ received })
            })

            setState({ status: 'extracting', received: 0, total: 0 })
            const toolsDir = getToolsDir()
            const dependencyDir = join(toolsDir, id)
            // 临时目录同卷
            const tmpDir = join(toolsDir, `.tmp-${id}`)
            mkdirSync(toolsDir, { recursive: true })
            rmSync(tmpDir, { recursive: true, force: true })

            // 先解压到临时目录
            try {
                await execFileAsync(getSevenZipPath(), ['x', '-y', `-o${tmpDir}`, archivePath], {
                    windowsHide: true
                })
            } catch {
                rmSync(tmpDir, { recursive: true, force: true })
                throw new Error(`${dependency.name} 解压失败，请重试`)
            }

            // 替换旧版本，失败保留
            try {
                rmSync(dependencyDir, { recursive: true, force: true })
                renameSync(join(tmpDir, id), dependencyDir)
            } catch {
                throw new Error(`${dependency.name} 文件正在被使用，请关闭相关功能后重试`)
            } finally {
                rmSync(tmpDir, { recursive: true, force: true })
            }

            writeFileSync(join(dependencyDir, '.version'), hash)
            rmSync(archivePath, { force: true })
            setState({ status: 'done', received: 0, total: 0 })
        } catch (error) {
            setState({
                status: 'error',
                error: error instanceof Error ? error.message : String(error)
            })
        } finally {
            installTask = null
        }
    })()
}
