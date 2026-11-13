import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
    closeSync,
    existsSync,
    openSync,
    readdirSync,
    readFileSync,
    readSync,
    rmSync,
    statSync,
    writeFileSync
} from 'node:fs'
import { join } from 'node:path'

// 默认 draft，--publish 才正式发布
const draft = !process.argv.includes('--publish')
const dryRun = process.argv.includes('--dry-run')
const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
const outDir = 'out'
const REPO = 'yoyokity/JapaneseLearning-Capture'

if (!existsSync(outDir)) {
    console.error('未找到 out 目录，请先执行 vp run package')
    process.exit(1)
}

// 依赖包名须唯一
const DEPENDENCY_IDS = ['ffmpeg', 'image-polish', 'mediainfo']
const DEPENDENCY_ASSET_PATTERN = /^JapLC-dep-(?<id>[a-z-]+)-(?<hash>[0-9a-f]{8})-x64\.7z$/
const dependencyArchives = new Map<string, string>()
for (const name of readdirSync(outDir)) {
    const { id = '' } = DEPENDENCY_ASSET_PATTERN.exec(name)?.groups ?? {}
    if (!id) continue
    if (dependencyArchives.has(id)) {
        console.error(`out 目录中存在多个 ${id} 依赖包，请重新执行 vp run package`)
        process.exit(1)
    }
    dependencyArchives.set(id, name)
}
const missingDependencies = DEPENDENCY_IDS.filter((id) => !dependencyArchives.has(id))
if (missingDependencies.length > 0) {
    console.error(`缺少依赖包：${missingDependencies.join(', ')}，请先执行 vp run package`)
    process.exit(1)
}
// 未登记依赖包告警
const unknownDependencies = [...dependencyArchives.keys()].filter(
    (id) => !DEPENDENCY_IDS.includes(id)
)
if (unknownDependencies.length > 0) {
    console.warn(`out 目录中存在未登记依赖包：${unknownDependencies.join(', ')}，将不会上传`)
}

const assets = [
    'JapLC-app-x64.7z',
    ...DEPENDENCY_IDS.map((id) => dependencyArchives.get(id) as string)
]
const missing = assets.filter((name) => !existsSync(join(outDir, name)))
if (missing.length > 0) {
    console.error(`缺少发布资产：${missing.join(', ')}，请先执行 vp run package`)
    process.exit(1)
}

// 发布包必须晚于构建产物
const newestInput = (() => {
    try {
        return Math.max(
            statSync('package.json').mtimeMs,
            statSync('dist/main/index.js').mtimeMs,
            statSync('dist/renderer/index.js').mtimeMs
        )
    } catch {
        console.error('未找到构建产物，请先执行 vp run package')
        process.exit(1)
    }
})()
if (statSync(join(outDir, 'JapLC-app-x64.7z')).mtimeMs < newestInput) {
    console.error('发布包早于当前构建产物，请先执行 vp run package')
    process.exit(1)
}

// 优先使用自定义说明
const notesFile = join(outDir, 'release-notes.md')
const hasCustomNotes = existsSync(notesFile)

if (dryRun) {
    console.log('gh release create', version, '--title', version)
    console.log(hasCustomNotes ? `--notes-file ${notesFile}` : '--generate-notes')
    console.log('--draft')
    console.log(assets.map((name) => join(outDir, name)).join('\n'))
    process.exit(0)
}

if (!(process.env as any).HTTPS_PROXY && !(process.env as any).https_proxy) {
    console.warn('提示：未设置 HTTPS_PROXY，GitHub 直连上传可能超时')
}

/** gh 错误处理 */
function throwGhError(error: unknown): never {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        console.error('未找到 gh，请安装 GitHub CLI 并加入 PATH')
        process.exit(1)
    }
    throw error
}

/** 执行 gh，输出透传 */
function runGh(args: string[]) {
    try {
        execFileSync('gh', args, { stdio: 'inherit' })
    } catch (error) {
        throwGhError(error)
    }
}

/** 执行 gh，读取输出 */
function runGhText(args: string[]) {
    try {
        return execFileSync('gh', args, { stdio: 'pipe', encoding: 'utf8' })
    } catch (error) {
        throwGhError(error)
    }
}

/** 计算大小与 sha256 */
function fileInfo(filePath: string) {
    const hash = createHash('sha256')
    const buffer = Buffer.allocUnsafe(1024 * 1024)
    const fd = openSync(filePath, 'r')

    try {
        while (true) {
            const bytesRead = readSync(fd, buffer, 0, buffer.length, null)
            if (bytesRead === 0) break
            hash.update(buffer.subarray(0, bytesRead))
        }
    } finally {
        closeSync(fd)
    }

    return { size: statSync(filePath).size, sha256: hash.digest('hex') }
}

/** 查询 release 状态 */
function getReleaseState(version: string) {
    try {
        const isDraft = runGhText([
            'release',
            'view',
            version,
            '--json',
            'isDraft',
            '--jq',
            '.isDraft'
        ]).trim()

        return isDraft === 'true' ? 'draft' : 'published'
    } catch {
        return 'none'
    }
}

/** 查询已有资产名 */
function getReleaseAssets(version: string) {
    try {
        const output = runGhText(['release', 'view', version, '--json', 'assets'])

        return (JSON.parse(output) as { assets: { name: string }[] }).assets.map(
            (asset) => asset.name
        )
    } catch {
        return []
    }
}

const releaseState = getReleaseState(version)
if (releaseState === 'published') {
    console.error(`release ${version} 已发布，请先修改 package.json 版本号`)
    process.exit(1)
}
if (releaseState === 'draft') {
    const existingAssets = getReleaseAssets(version)
    const draftReady = [...assets, 'latest.json'].every((name) => existingAssets.includes(name))

    // draft 完整时直接转正式
    if (!draft && draftReady) {
        runGh(['release', 'edit', version, '--draft=false'])
        process.exit(0)
    }

    console.warn(`检测到未完成的 draft ${version}，删除后重新创建`)
    runGh(['release', 'delete', version, '--yes'])
}

// 创建 draft 并上传资产
const createArgs = ['release', 'create', version, '--title', version]
if (hasCustomNotes) {
    createArgs.push('--notes-file', notesFile)
} else {
    createArgs.push('--generate-notes')
}
createArgs.push('--draft', ...assets.map((name) => join(outDir, name)))
runGh(createArgs)

// 用完删除，避免误用
if (hasCustomNotes) {
    rmSync(notesFile, { force: true })
}

// 读取说明（不含下载引导）
const rawNotes = runGhText(['release', 'view', version, '--json', 'body', '--jq', '.body'])
const notes = rawNotes.trim() === 'null' ? '' : rawNotes

// 插入下载引导
const releasePagePath = join(outDir, 'release-page.md')
writeFileSync(
    releasePagePath,
    [
        '### 📥 下载',
        '',
        `**请下载 [JapLC-app-x64.7z](https://github.com/${REPO}/releases/download/${version}/JapLC-app-x64.7z)，解压即可使用。首次启动后请在「设置 → 依赖」中下载必需组件。**`,
        '',
        '---',
        '',
        notes
    ].join('\n')
)
runGh(['release', 'edit', version, '--notes-file', releasePagePath])

// 历史版本 tag
const versions = [
    version,
    ...(
        JSON.parse(
            runGhText([
                'release',
                'list',
                '--json',
                'tagName,isDraft,isPrerelease',
                '--limit',
                '100'
            ])
        ) as { tagName: string; isDraft: boolean; isPrerelease: boolean }[]
    )
        .filter((item) => !item.isDraft && !item.isPrerelease && item.tagName !== version)
        .map((item) => item.tagName)
]

const manifest = {
    version,
    tag: version,
    date: new Date().toISOString(),
    notes,
    versions,
    assets: {
        app: { name: 'JapLC-app-x64.7z', ...fileInfo(join(outDir, 'JapLC-app-x64.7z')) },
        dependencies: Object.fromEntries(
            DEPENDENCY_IDS.map((id) => {
                const name = dependencyArchives.get(id) as string
                return [id, { name, ...fileInfo(join(outDir, name)) }]
            })
        )
    }
}
const manifestPath = join(outDir, 'latest.json')
writeFileSync(manifestPath, JSON.stringify(manifest, null, 4))

// 上传更新清单
runGh(['release', 'upload', version, manifestPath])

if (!draft) {
    runGh(['release', 'edit', version, '--draft=false'])
}
