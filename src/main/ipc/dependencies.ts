import type { ISubtitleSource } from '../subtitle/sources'
import type { ILatestManifest } from './update'

import { execFile } from 'node:child_process'
import {
    cpSync,
    existsSync,
    mkdirSync,
    readFileSync,
    renameSync,
    rmSync,
    statSync,
    writeFileSync
} from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { app } from 'electron'

import { appPath } from '../globalStates'
import { Helper } from '../helper'
import { findFile, getSourceSize, getSourceUrls, SUBTITLE_SOURCES } from '../subtitle/sources'
import { DOWNLOAD_BASE, fetchLatestManifest, getSevenZipPath } from './update'

const execFileAsync = promisify(execFile)

/**
 * 依赖的物理包
 */
export interface IDependencyComponent {
    /** tools 目录名 */
    id: string
    /** 安装检测文件 */
    files: string[]
}

/**
 * 依赖定义
 */
export interface IDependencyDefinition {
    /** 依赖 id，界面上以它为单位展示 */
    id: string
    /** 展示名称 */
    name: string
    /** 功能说明 */
    description: string
    /** 组成该依赖的物理包，统一工具包内含多个目录 */
    components: IDependencyComponent[]
    /** 是否必需 */
    required: boolean
}

/** 应用依赖的工具 */
const DEPENDENCIES: IDependencyDefinition[] = [
    {
        id: 'tools',
        name: '工具组件',
        description: '音频、图片与媒体处理工具',
        required: true,
        components: [
            { id: 'ffmpeg', files: ['ffmpeg.exe'] },
            {
                id: 'image-polish',
                files: ['imagepolish.exe', 'onnxruntime.dll', 'DirectML.dll']
            },
            { id: 'mediainfo', files: ['MediaInfo.exe', 'LIBCURL.DLL'] }
        ]
    },
    {
        id: 'subtitle',
        name: '字幕生成',
        description: '本地语音识别与中文字幕生成',
        required: false,
        components: [
            {
                id: 'subtitle',
                files: [
                    'runtimes/windows-x64/cuda/bin/crispasr.exe',
                    'models/qwen3-forced-aligner.gguf',
                    'models/vad/whisper-vad-asmr-q4_k.gguf',
                    'models/cohere-transcribe-q4_k.gguf'
                ]
            }
        ]
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
 * 读取物理包的本地版本
 * @param id 物理包 id
 */
function readComponentVersion(id: string) {
    try {
        return readFileSync(join(getToolsDir(), id, '.version'), 'utf8').trim()
    } catch {
        return ''
    }
}

/**
 * 读取本地版本
 * @param dependency 依赖定义
 * @remark 多个物理包的版本用 + 连接
 */
function readLocalVersion(dependency: IDependencyDefinition) {
    const versions = dependency.components
        .map((component) => readComponentVersion(component.id))
        .filter(Boolean)

    return [...new Set(versions)].join('+')
}

/**
 * 检查依赖是否完整
 * @param dependency 依赖定义
 */
function isInstalled(dependency: IDependencyDefinition) {
    return dependency.components.every((component) =>
        component.files.every((file) => existsSync(join(getToolsDir(), component.id, file)))
    )
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
        version: readLocalVersion(dependency),
        latestVersion: '',
        updateAvailable: false,
        size: 0
    }))
}

/**
 * 迁移旧版独立的 subtitle-cohere 目录
 * @param version 新版字幕依赖版本
 * @remark 迁移后写入版本号，避免老用户重新下载
 */
function migrateSubtitleCohere(version?: string) {
    if (!version) return

    const toolsDir = getToolsDir()
    const oldDir = join(toolsDir, 'subtitle-cohere')
    const oldFile = join(oldDir, 'cohere-transcribe-q4_k.gguf')
    if (!existsSync(oldFile)) return

    const newFile = join(toolsDir, 'subtitle/models/cohere-transcribe-q4_k.gguf')
    if (existsSync(newFile)) {
        rmSync(oldDir, { recursive: true, force: true })
        return
    }

    mkdirSync(dirname(newFile), { recursive: true })
    renameSync(oldFile, newFile)
    rmSync(oldDir, { recursive: true, force: true })
    writeFileSync(join(toolsDir, 'subtitle/.version'), version)
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
    const { subtitle } = dependencies ?? {}
    migrateSubtitleCohere(subtitle?.version)

    const toolsAsset = manifest?.assets?.tools
    const items = getLocalDependencies().map((item) => {
        const isTools = item.id === 'tools'
        const components = item.components.map((component) => {
            const local = readComponentVersion(component.id)
            // 统一工具包的版本对整个依赖生效
            if (isTools) {
                return { local, remote: toolsAsset?.version ?? '', size: 0 }
            }

            // 官网直下的依赖体积固定，版本由清单直接给出
            const sourceSize = getSourceSize(component.id)

            return {
                local,
                remote: sourceSize > 0 ? (dependencies?.[component.id]?.version ?? '') : '',
                size: sourceSize
            }
        })

        return {
            ...item,
            latestVersion: [
                ...new Set(components.map((component) => component.remote).filter(Boolean))
            ].join('+'),
            // 任一物理包版本不一致即提示更新
            updateAvailable: components.some(
                (component) =>
                    Boolean(component.local) &&
                    Boolean(component.remote) &&
                    component.local !== component.remote
            ),
            size: isTools
                ? (toolsAsset?.size ?? 0)
                : components.reduce((sum, component) => sum + component.size, 0)
        }
    })

    return {
        items,
        // 开发模式视为可用；字幕为可选依赖，缺失不影响整体可用
        remoteOk: !app.isPackaged || Boolean(toolsAsset)
    }
}

/** 源文件下载选项 */
interface ISourceDownloadOptions {
    /** 文件大小 */
    size: number
    /** 文件 sha256 */
    sha256: string
    /** 保存路径 */
    targetPath: string
    /** 已下载字节数回调 */
    onProgress: (received: number) => void
    /** 官方地址失败回调 */
    onFallback: () => void
}

/**
 * 依次尝试多个源地址下载
 * @param urls 候选地址，按优先级排列
 * @param options 下载选项
 */
async function downloadFromSources(urls: string[], options: ISourceDownloadOptions) {
    const { onFallback, ...rest } = options
    let lastError: unknown = null

    for (const [index, url] of urls.entries()) {
        try {
            return await Helper.downloadFile({ url, ...rest })
        } catch (error) {
            lastError = error
            if (index === 0) onFallback()
        }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

/**
 * 安装官网直下的组件
 * @param name 依赖展示名称
 * @param component 组件定义
 * @param sources 源文件清单
 * @param version 版本号
 * @param offset 已完成字节数
 * @param total 总字节数
 */
async function installLocalComponent(
    name: string,
    component: IDependencyComponent,
    sources: ISubtitleSource[],
    version: string,
    offset: number,
    total: number
) {
    const toolsDir = getToolsDir()
    const dependencyDir = join(toolsDir, component.id)
    // 中断后保留临时目录，已下载文件可复用
    const tmpDir = join(toolsDir, `.tmp-${component.id}`)
    const depsDir = join(app.getPath('userData'), 'dependency')
    mkdirSync(tmpDir, { recursive: true })
    mkdirSync(depsDir, { recursive: true })

    let received = offset
    let preferMirror = false

    for (const source of sources) {
        const urls = getSourceUrls(source.url, preferMirror)
        const downloadOptions = {
            size: source.size,
            sha256: source.sha256,
            onProgress: (value: number) => setState({ received: received + value }),
            onFallback: () => {
                preferMirror = true
            }
        }

        if (source.archive) {
            const archivePath = join(depsDir, basename(new URL(source.url).pathname))
            // 已完整下载的压缩包直接复用
            if (!existsSync(archivePath) || statSync(archivePath).size !== source.size) {
                await downloadFromSources(urls, { ...downloadOptions, targetPath: archivePath })
            }

            setState({ status: 'extracting', received, total })
            const extractDir = join(tmpDir, '.extract')
            rmSync(extractDir, { recursive: true, force: true })
            try {
                await execFileAsync(
                    getSevenZipPath(),
                    ['x', '-y', `-o${extractDir}`, archivePath],
                    { windowsHide: true }
                )
            } catch {
                rmSync(extractDir, { recursive: true, force: true })
                throw new Error(`${name} 解压失败，请重试`)
            }

            const exePath = findFile(extractDir, 'crispasr.exe')
            if (!exePath) {
                rmSync(extractDir, { recursive: true, force: true })
                throw new Error('压缩包中未找到 crispasr.exe')
            }

            const targetPath = join(tmpDir, component.id, source.target)
            mkdirSync(targetPath, { recursive: true })
            cpSync(dirname(exePath), targetPath, { recursive: true })
            rmSync(extractDir, { recursive: true, force: true })
            rmSync(archivePath, { force: true })
        } else {
            // 已完整下载的文件直接复用
            const targetPath = join(tmpDir, component.id, source.target)
            if (!existsSync(targetPath) || statSync(targetPath).size !== source.size) {
                mkdirSync(dirname(targetPath), { recursive: true })
                await downloadFromSources(urls, { ...downloadOptions, targetPath })
            }
        }

        received += source.size
        setState({ status: 'downloading', received })
    }

    // 替换旧版本，失败保留
    try {
        rmSync(dependencyDir, { recursive: true, force: true })
        renameSync(join(tmpDir, component.id), dependencyDir)
    } catch {
        throw new Error(`${name} 文件正在被使用，请关闭相关功能后重试`)
    }

    rmSync(tmpDir, { recursive: true, force: true })
    writeFileSync(join(dependencyDir, '.version'), version)
}

/** 统一工具包资产 */
interface IToolsAsset {
    /** 资产文件名 */
    name: string
    /** 文件大小 */
    size: number
    /** 文件 sha256 */
    sha256: string
    /** 包版本 */
    version: string
}

/**
 * 安装统一工具包
 * @param components 包内组件
 * @param asset 远端资产
 * @param tag 版本 tag
 */
async function installToolsPackage(
    components: IDependencyComponent[],
    asset: IToolsAsset,
    tag: string
) {
    const toolsDir = getToolsDir()
    const depsDir = join(app.getPath('userData'), 'dependency')
    mkdirSync(toolsDir, { recursive: true })
    mkdirSync(depsDir, { recursive: true })

    const archivePath = join(depsDir, asset.name)
    // 已完整下载的压缩包直接复用
    if (!existsSync(archivePath) || statSync(archivePath).size !== asset.size) {
        await Helper.downloadFile({
            url: `${DOWNLOAD_BASE}/${tag}/${asset.name}`,
            size: asset.size,
            sha256: asset.sha256,
            targetPath: archivePath,
            onProgress: (received) => setState({ received })
        })
    }

    setState({ status: 'extracting', received: 0, total: 0 })
    const tmpDir = join(toolsDir, '.tmp-tools')
    rmSync(tmpDir, { recursive: true, force: true })
    mkdirSync(tmpDir, { recursive: true })
    try {
        await execFileAsync(getSevenZipPath(), ['x', '-y', `-o${tmpDir}`, archivePath], {
            windowsHide: true
        })
    } catch {
        rmSync(tmpDir, { recursive: true, force: true })
        throw new Error('工具组件解压失败，请重试')
    }

    // 逐个替换，保留 tools 下其他目录
    for (const component of components) {
        const targetDir = join(toolsDir, component.id)
        try {
            rmSync(targetDir, { recursive: true, force: true })
            renameSync(join(tmpDir, component.id), targetDir)
        } catch {
            throw new Error('工具组件文件正在被使用，请关闭相关功能后重试')
        }
        writeFileSync(join(targetDir, '.version'), asset.version)
    }

    rmSync(tmpDir, { recursive: true, force: true })
    rmSync(archivePath, { force: true })
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
            if (!manifest) {
                throw new Error('依赖信息已失效，请重新检查')
            }
            // 下载前先迁移旧版目录，避免重复下载
            const { subtitle } = manifest.assets?.dependencies ?? {}
            migrateSubtitleCohere(subtitle?.version)

            if (id === 'tools') {
                const asset = manifest.assets?.tools
                if (!asset?.name || !asset.size || !asset.sha256 || !asset.version) {
                    throw new Error('依赖信息已失效，请重新检查')
                }

                setState({ id, status: 'downloading', received: 0, total: asset.size, error: null })
                await installToolsPackage(dependency.components, asset, manifest.tag)
                setState({ status: 'done', received: 0, total: 0 })
                return
            }

            // 官网直下的依赖
            const [component] = dependency.components
            const sources = component
                ? SUBTITLE_SOURCES.filter((source) => source.component === component.id)
                : []
            const version = component
                ? manifest.assets?.dependencies?.[component.id]?.version
                : undefined
            if (!component || sources.length === 0 || !version) {
                throw new Error('依赖信息已失效，请重新检查')
            }

            const total = getSourceSize(component.id)
            setState({ id, status: 'downloading', received: 0, total, error: null })
            await installLocalComponent(dependency.name, component, sources, version, 0, total)
            setState({ status: 'done', received: 0, total: 0 })
        } catch (error) {
            // 标记 id，前端据此结束排队任务
            setState({
                id,
                status: 'error',
                error: error instanceof Error ? error.message : String(error)
            })
        } finally {
            installTask = null
        }
    })()
}
