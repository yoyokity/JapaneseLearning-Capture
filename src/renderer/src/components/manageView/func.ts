import type { Path } from '@renderer/helper'
import type { IVideoFile } from '@renderer/scraper'

import { EncodeHelper, LogHelper, PathHelper, TaskHelper, videoExtensions } from '@renderer/helper'
import { Ipc } from '@renderer/ipc'
import { createVideoFile, Scraper } from '@renderer/scraper'
import { globalStatesStore } from '@renderer/stores'
import { convert } from 'xmlbuilder2'

/**
 * 将 NFO 中的文本节点规范化为字符串
 * @param value 原始值
 */
function normalizeTextValue(value: unknown): string {
    if (typeof value === 'string' || typeof value === 'number') {
        return String(value)
    }

    if (value && typeof value === 'object') {
        const text = Reflect.get(value, '#')
        if (typeof text === 'string' || typeof text === 'number') {
            return String(text)
        }
    }

    return ''
}

/**
 * 扫描目录下的文件
 * @remarks 忽略extrafanart目录下的文件
 */
export async function scanFiles(toast: any) {
    const globalStates = globalStatesStore()
    globalStates.scanFilesLoading = true

    try {
        const path = Scraper.getCurrentScraperPath()

        const videoFiles: IVideoFile[] = []
        const files = await PathHelper.readDirectory(path, 'file', undefined, ['**/extrafanart/**'])

        // 过滤出视频文件
        for (const file of files.filter((file) => {
            const ext = PathHelper.newPath(file).extname.toLowerCase()
            return Object.keys(videoExtensions).includes(ext)
        })) {
            videoFiles.push(await read(file))
            // TODO: 按分页分量加载
        }

        // 更新文件列表状态
        globalStates.setManageViewFiles(videoFiles)
        // 扫描完成后刷新图片缓存状态，确保同路径图片重新加载
        globalStates.refreshImageCacheVersion()
    } catch (error) {
        LogHelper.error('扫描目录下的文件发生错误', error)
        toast.add({
            severity: 'error',
            summary: '扫描目录下的文件发生错误',
            life: 3000
        })
        globalStates.scanFilesLoading = false
    }

    globalStates.scanFilesLoading = false
}

/**
 * 读取NFO文件为video
 */
async function read(path: string): Promise<IVideoFile> {
    const video = createVideoFile(path)

    // 打开文件
    const re = await TaskHelper.tryExecute(
        Ipc.filesystem.readFile,
        video.nfoPath.toString(),
        'utf-8'
    )
    if (re.hasError) {
        LogHelper.warn(`读取NFO文件失败：${video.nfoPath.toString()} \n`, re.error)
        return video
    }

    const obj: any = convert({ encoding: 'UTF-8' }, re.result, { format: 'object' })
    if (!obj || !obj.movie) {
        LogHelper.warn(`读取NFO文件失败（数据格式错误）：${video.nfoPath.toString()}`)
        return video
    }

    const movie = obj.movie
    //
    video.scraperName = movie.scraperName || ''
    video.title = EncodeHelper.decodeHtmlEntity(movie.title) || ''
    video.originaltitle = EncodeHelper.decodeHtmlEntity(movie.originaltitle) || ''
    video.sorttitle = EncodeHelper.decodeHtmlEntity(movie.sorttitle) || ''
    video.tagline = EncodeHelper.decodeHtmlEntity(movie.tagline) || ''
    video.plot = EncodeHelper.decodeHtmlEntity(movie.plot) || ''
    video.mpaa = movie.mpaa || ''
    video.rating = movie.rating || ''
    video.director = movie.director || ''
    video.studio = movie.studio || ''
    video.maker = movie.maker || ''
    video.set = movie.set || ''
    video.year = movie.year || ''
    video.premiered = movie.premiered || ''
    video.releasedate = movie.releasedate || ''

    // 处理编号信息
    video.num = {}
    if (movie.num) {
        const nums = Array.isArray(movie.num) ? movie.num : [movie.num]

        try {
            for (const num of nums) {
                const source = normalizeTextValue(num.source).trim()
                const value = normalizeTextValue(num.value).trim()
                if (!source || !value) continue

                video.num[source] = value
            }
        } catch {}
    }

    // 处理演员信息
    if (movie.actor) {
        const actors = Array.isArray(movie.actor) ? movie.actor : [movie.actor]
        video.actor = actors.map((actor) => ({
            name: actor.name || '',
            imgUrl: actor.thumb || '',
            role: actor.role || ''
        }))
    }

    // 处理标签
    if (movie.tag) {
        const tags = Array.isArray(movie.tag) ? movie.tag : [movie.tag]
        video.tag = tags.map((tag) => normalizeTextValue(tag)).filter(Boolean)
    }

    // 处理类型
    if (movie.genre) {
        const genres = Array.isArray(movie.genre) ? movie.genre : [movie.genre]
        video.genre = genres.map((genre) => normalizeTextValue(genre)).filter(Boolean)
    }

    // 处理图片
    if (movie.poster) {
        const posterPath = PathHelper.newPath(movie.poster)
        const normalizedPosterPath = posterPath.isAbsolute
            ? posterPath
            : video.dir.join(movie.poster)
        video.poster = (await normalizedPosterPath.isExist())
            ? normalizedPosterPath.toString()
            : null
    }

    if (movie.thumb) {
        const thumbPath = PathHelper.newPath(movie.thumb)
        const normalizedThumbPath = thumbPath.isAbsolute ? thumbPath : video.dir.join(movie.thumb)
        video.thumb = (await normalizedThumbPath.isExist()) ? normalizedThumbPath.toString() : null
    }

    if (movie.fanart) {
        const fanartPath = PathHelper.newPath(movie.fanart)
        const normalizedFanartPath = fanartPath.isAbsolute
            ? fanartPath
            : video.dir.join(movie.fanart)
        video.fanart = (await normalizedFanartPath.isExist())
            ? normalizedFanartPath.toString()
            : null
    }

    return video
}

/**
 * 读取extrafanart目录下的文件
 */
export async function readExtrafanart(
    videoDir: Path,
    video: IVideoFile,
    sourceVideo: IVideoFile
): Promise<number> {
    let extrafanart = await PathHelper.readDirectory(
        videoDir.join('extrafanart'),
        'file',
        undefined,
        undefined,
        1
    )

    // 按Windows文件名顺序排序（自然排序）
    extrafanart = extrafanart.sort((a, b) => {
        // Windows文件名排序规则：先按数字部分排序，再按字母排序
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
    })

    video.extrafanart = []
    sourceVideo.extrafanart = []
    for (const file of extrafanart) {
        const filePath = PathHelper.newPath(file)
        const ext = filePath.extname.toLowerCase()
        if (ext === '.jpg' || ext === '.png' || ext === '.jpeg' || ext === '.webp') {
            // 因为是拷贝之后的异步执行，所以两个都要有
            video.extrafanart.push(filePath.toString())
            sourceVideo.extrafanart.push(filePath.toString())
        }
    }

    return video.extrafanart.length
}
