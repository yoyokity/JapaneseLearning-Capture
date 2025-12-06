import type { Path } from '@renderer/helper'
import type { IVideoFile } from '@renderer/scraper'

import { DebugHelper, ImageHelper, PathHelper, videoExtensions } from '@renderer/helper'
import { Ipc } from '@renderer/ipc'
import { createVideoFile, Scraper } from '@renderer/scraper'
import { globalStatesStore } from '@renderer/stores'
import { convert } from 'xmlbuilder2'

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
            return videoExtensions.includes(ext)
        })) {
            videoFiles.push(await read(file))
        }

        //更新文件列表状态
        globalStates.setManageViewFiles(videoFiles)
    } catch (error) {
        DebugHelper.error('扫描目录下的文件发生错误', error)
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

    //打开文件
    const re = await DebugHelper.tryExecute(
        Ipc.filesystem.readFile,
        video.nfoPath.toString(),
        'utf-8'
    )
    if (re.hasError) {
        DebugHelper.warn(`读取NFO文件失败：${video.nfoPath.toString()} \n`, re.error)
        return video
    }

    const obj: any = convert({ encoding: 'UTF-8' }, re.result, { format: 'object' })
    if (!obj || !obj.movie) {
        DebugHelper.warn(`读取NFO文件失败（数据格式错误）：${video.nfoPath.toString()}`)
        return video
    }

    const movie = obj.movie
    //
    video.scraperName = movie.scraperName || ''
    video.title = movie.title || ''
    video.originaltitle = movie.originaltitle || ''
    video.sorttitle = movie.sorttitle || ''
    video.tagline = movie.tagline || ''
    video.plot = movie.plot || ''
    video.num = movie.num || ''
    video.mpaa = movie.mpaa || ''
    video.rating = movie.rating || ''
    video.director = movie.director || ''
    video.studio = movie.studio || ''
    video.maker = movie.maker || ''
    video.set = movie.set || ''
    video.year = movie.year || ''
    video.premiered = movie.premiered || ''
    video.releasedate = movie.releasedate || ''

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
        video.tag = tags.map((tag) => tag || '')
    }

    // 处理类型
    if (movie.genre) {
        const genres = Array.isArray(movie.genre) ? movie.genre : [movie.genre]
        video.genre = genres.map((genre) => genre || '')
    }

    //处理图片
    if (movie.poster) {
        if (!PathHelper.newPath(movie.poster).isAbsolute) {
            movie.poster = video.dir.join(movie.poster)
        }
        video.poster = await ImageHelper.readImage(movie.poster)
    }

    if (movie.thumb) {
        if (!PathHelper.newPath(movie.thumb).isAbsolute) {
            movie.thumb = video.dir.join(movie.thumb)
        }
        video.thumb = await ImageHelper.readImage(movie.thumb)
    }

    if (movie.fanart) {
        if (!PathHelper.newPath(movie.fanart).isAbsolute) {
            movie.fanart = video.dir.join(movie.fanart)
        }
        video.fanart = await ImageHelper.readImage(movie.fanart)
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
            const re = await ImageHelper.readImage(filePath)
            if (re) {
                //因为是拷贝之后的异步执行，所以两个都要有
                video.extrafanart.push(re)
                sourceVideo.extrafanart.push(re)
            }
        }
    }

    return video.extrafanart.length
}
