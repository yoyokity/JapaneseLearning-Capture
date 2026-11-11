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

// 默认创建 draft，确认资产无误后再加 --publish 正式发布
const draft = !process.argv.includes('--publish')
const dryRun = process.argv.includes('--dry-run')
const { version } = JSON.parse(readFileSync('package.json', 'utf8'))
const outDir = 'out'
const REPO = 'yoyokity/JapaneseLearning-Capture'

if (!existsSync(outDir)) {
    console.error('未找到 out 目录，请先执行 pnpm package')
    process.exit(1)
}

// tools 包名带内容 hash，需要动态查找且必须唯一
const toolsArchives = readdirSync(outDir).filter((name) =>
    /^JapLC-tools-[0-9a-f]{8}-x64\.7z$/.test(name)
)
if (toolsArchives.length !== 1) {
    console.error(
        `out 目录中应恰好有一个 tools 包，实际找到 ${toolsArchives.length} 个，请重新执行 pnpm package`
    )
    process.exit(1)
}

const assets = ['JapLC-x64.7z', 'JapLC-app-x64.7z', toolsArchives[0]]
const missing = assets.filter((name) => !existsSync(join(outDir, name)))
if (missing.length > 0) {
    console.error(`缺少发布资产：${missing.join(', ')}，请先执行 pnpm package`)
    process.exit(1)
}

// 发布包必须晚于构建产物，避免把旧包发布成新版本
const newestInput = (() => {
    try {
        return Math.max(
            statSync('package.json').mtimeMs,
            statSync('dist/main/index.js').mtimeMs,
            statSync('dist/renderer/index.js').mtimeMs
        )
    } catch {
        console.error('未找到构建产物，请先执行 pnpm package')
        process.exit(1)
    }
})()
if (statSync(join(outDir, 'JapLC-app-x64.7z')).mtimeMs < newestInput) {
    console.error('发布包早于当前构建产物，请先执行 pnpm package')
    process.exit(1)
}

// 存在自定义发布说明时优先使用，否则让 gh 自动生成
const notesFile = join(outDir, 'release-notes.md')
const hasCustomNotes = existsSync(notesFile)

if (dryRun) {
    console.log('gh release create', version, '--title', version)
    console.log(hasCustomNotes ? `--notes-file ${notesFile}` : '--generate-notes')
    console.log('--draft')
    console.log(assets.map((name) => join(outDir, name)).join('\n'))
    process.exit(0)
}

if (!process.env.HTTPS_PROXY && !process.env.https_proxy) {
    console.warn('提示：未设置 HTTPS_PROXY，GitHub 直连上传可能超时')
}

/**
 * 计算文件大小与 sha256
 * @param {string} filePath 文件路径
 */
function fileInfo(filePath) {
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

/**
 * 调用 gh
 * @param {string[]} args 参数
 * @param {object} options execFileSync 选项
 */
function runGh(args, options = {}) {
    try {
        return execFileSync('gh', args, { stdio: 'inherit', ...options })
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.error('未找到 gh，请安装 GitHub CLI 并加入 PATH')
            process.exit(1)
        }
        throw error
    }
}

/**
 * 查询同名 release 的状态
 * @param {string} version 版本号
 */
function getReleaseState(version) {
    try {
        const isDraft = execFileSync(
            'gh',
            ['release', 'view', version, '--json', 'isDraft', '--jq', '.isDraft'],
            { stdio: 'pipe', encoding: 'utf8' }
        ).trim()

        return isDraft === 'true' ? 'draft' : 'published'
    } catch {
        return 'none'
    }
}

/**
 * 查询 release 已有的资产名
 * @param {string} version 版本号
 */
function getReleaseAssets(version) {
    try {
        const output = execFileSync('gh', ['release', 'view', version, '--json', 'assets'], {
            stdio: 'pipe',
            encoding: 'utf8'
        })

        return JSON.parse(output).assets.map((asset) => asset.name)
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

    // draft 已完整时只转正式发布，避免重复上传
    if (!draft && draftReady) {
        runGh(['release', 'edit', version, '--draft=false'])
        process.exit(0)
    }

    console.warn(`检测到未完成的 draft ${version}，删除后重新创建`)
    runGh(['release', 'delete', version, '--yes'])
}

// 先创建 draft 并上传安装包
const createArgs = ['release', 'create', version, '--title', version]
if (hasCustomNotes) {
    createArgs.push('--notes-file', notesFile)
} else {
    createArgs.push('--generate-notes')
}
createArgs.push('--draft', ...assets.map((name) => join(outDir, name)))
runGh(createArgs)

// 自定义说明已被 release 使用，删除避免下次误用
if (hasCustomNotes) {
    rmSync(notesFile, { force: true })
}

// 读取发布说明，用于应用内展示（不含下载引导）
const rawNotes = runGh(['release', 'view', version, '--json', 'body', '--jq', '.body'], {
    stdio: 'pipe',
    encoding: 'utf8'
})
const notes = rawNotes.trim() === 'null' ? '' : rawNotes

// 发布页顶部插入全量包下载引导，增量包不展示给普通用户
const releasePagePath = join(outDir, 'release-page.md')
writeFileSync(
    releasePagePath,
    [
        '### 📥 下载',
        '',
        `**请下载 [JapLC-x64.7z](https://github.com/${REPO}/releases/download/${version}/JapLC-x64.7z)，解压即可使用。**`,
        '',
        '---',
        '',
        notes
    ].join('\n')
)
runGh(['release', 'edit', version, '--notes-file', releasePagePath])

const manifest = {
    version,
    tag: version,
    date: new Date().toISOString(),
    notes,
    assets: {
        app: { name: 'JapLC-app-x64.7z', ...fileInfo(join(outDir, 'JapLC-app-x64.7z')) },
        tools: { name: toolsArchives[0], ...fileInfo(join(outDir, toolsArchives[0])) }
    }
}
const manifestPath = join(outDir, 'latest.json')
writeFileSync(manifestPath, JSON.stringify(manifest, null, 4))

// 上传更新清单，程序通过 releases/latest/download/latest.json 读取
runGh(['release', 'upload', version, manifestPath])

if (!draft) {
    runGh(['release', 'edit', version, '--draft=false'])
}
