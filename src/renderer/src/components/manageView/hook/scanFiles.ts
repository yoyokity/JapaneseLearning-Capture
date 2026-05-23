import type { Path } from '@renderer/helper'
import type { IVideoFile } from '@renderer/scraper'
import type { IFile, IStats } from '@shared'

import { useDisplay } from '@renderer/components/manageView/hook'
import {
    DataHelper,
    imgExtnames,
    LogHelper,
    PathHelper,
    StringHelper,
    TaskHelper,
    videoExtensions
} from '@renderer/helper'
import { createVideoFile, Scraper } from '@renderer/scraper'
import { globalStatesStore, settingsStore } from '@renderer/stores'
import dayjs from 'dayjs'
import { useToast } from 'primevue/usetoast'
import { convert } from 'xmlbuilder2'

interface IDirectory {
    video: IFile
    nfo?: IFile
    img: {
        poster?: IFile
        fanart?: IFile
        thumb?: IFile
    }
    stats?: IStats
}

type INfoCacheData = Omit<
    IVideoFile,
    | 'path'
    | 'dir'
    | 'fileName'
    | 'extname'
    | 'nfoPath'
    | 'size'
    | 'joinTime'
    | 'dirJoinTime'
    | 'changeTime'
    | 'extrafanart'
>

interface INfoCacheRecord {
    updateTime: number
    data: INfoCacheData
}

const NFO_CACHE_DATA_NAME = '#nfo-cache-data'

export function useScanFiles() {
    const globalStates = globalStatesStore()
    const toast = useToast()
    const display = useDisplay()

    async function runScanFiles() {
        globalStates.scanFilesLoading = true

        try {
            const path = Scraper.getCurrentScraperPath()
            const videoFiles: IVideoFile[] = []

            // 先读取所有视频文件、图片文件和nfo文件
            const videoExtPattern = Object.keys(videoExtensions)
                .concat(imgExtnames)
                .map((ext) => ext.slice(1))
                .join(',')
            const rawFiles = await PathHelper.readDirectory(path, `**/*.{${videoExtPattern},nfo}`, {
                ignore: ['**/extrafanart/**'],
                onlyFiles: true,
                stats: true
            })

            const videoExtSet = new Set(Object.keys(videoExtensions))
            const imgExtSet = new Set(imgExtnames)
            const groupedDirectoryMap = new Map<
                string,
                {
                    dirName: string
                    video?: IFile
                    nfos: IFile[]
                    img: IDirectory['img']
                }
            >()

            // 按父目录聚合文件，并过滤掉空文件
            for (const file of rawFiles) {
                if (file.stats.size <= 0) continue

                const filePath = PathHelper.newPath(file.path)
                const dirPath = filePath.parent.toString()
                let directory = groupedDirectoryMap.get(dirPath)

                if (!directory) {
                    directory = {
                        dirName: filePath.parent.filename.toLowerCase(),
                        nfos: [],
                        img: {}
                    }
                    groupedDirectoryMap.set(dirPath, directory)
                }

                const ext = filePath.extname.toLowerCase()
                const basename = filePath.basename.toLowerCase()

                // 筛选视频文件
                if (videoExtSet.has(ext)) {
                    // 目录内第一个视频先作为候选主视频
                    if (!directory.video) {
                        directory.video = file
                        continue
                    }

                    const currentVideoName = PathHelper.newPath(
                        directory.video.path
                    ).basename.toLowerCase()
                    const currentIsDirName = currentVideoName === directory.dirName
                    const nextIsDirName = basename === directory.dirName

                    // 同目录名的视频优先，否则退化为选择体积更大的视频
                    if (
                        (nextIsDirName && !currentIsDirName) ||
                        (nextIsDirName === currentIsDirName &&
                            file.stats.size > directory.video.stats.size)
                    ) {
                        directory.video = file
                    }
                    continue
                }

                // 筛选NFO文件
                if (ext === '.nfo') {
                    directory.nfos.push(file)
                    continue
                }

                // 筛选图片文件
                if (!imgExtSet.has(ext)) continue
                if (basename === 'poster') {
                    if (
                        // 同名图片理论上只会有一个，这里保留较新的文件兜底
                        !directory.img.poster ||
                        getFileUpdateTime(file.stats) >
                            getFileUpdateTime(directory.img.poster.stats)
                    ) {
                        directory.img.poster = file
                    }
                } else if (basename === 'fanart') {
                    if (
                        // 同名图片理论上只会有一个，这里保留较新的文件兜底
                        !directory.img.fanart ||
                        getFileUpdateTime(file.stats) >
                            getFileUpdateTime(directory.img.fanart.stats)
                    ) {
                        directory.img.fanart = file
                    }
                } else if (basename === 'thumb') {
                    if (
                        // 同名图片理论上只会有一个，这里保留较新的文件兜底
                        !directory.img.thumb ||
                        getFileUpdateTime(file.stats) > getFileUpdateTime(directory.img.thumb.stats)
                    ) {
                        directory.img.thumb = file
                    }
                }
            }

            const directories: IDirectory[] = []
            for (const directory of groupedDirectoryMap.values()) {
                if (!directory.video) continue

                const videoName = PathHelper.newPath(directory.video.path).basename.toLowerCase()
                let latestNfo: IFile | undefined
                let matchedNfo: IFile | undefined

                // 如果有多个NFO，筛选nfo
                for (const nfo of directory.nfos) {
                    // 先记住最新的NFO，供未命中同名时回退
                    if (
                        !latestNfo ||
                        getFileUpdateTime(nfo.stats) > getFileUpdateTime(latestNfo.stats)
                    ) {
                        latestNfo = nfo
                    }

                    // 优先选择与主视频同名的NFO
                    if (PathHelper.newPath(nfo.path).basename.toLowerCase() === videoName) {
                        matchedNfo = nfo
                    }
                }

                // 优先选择与主视频同名的NFO，否则选择最新的
                const nfo = matchedNfo || latestNfo

                directories.push({
                    video: directory.video,
                    nfo,
                    img: directory.img
                })
            }

            // 先缓存父目录路径，避免重复创建 Path 对象
            const parentPaths = directories.map((directory) =>
                PathHelper.newPath(directory.video.path).parent.toString()
            )

            // 获取视频文件的父目录状态
            const statsList = await PathHelper.getStats(parentPaths)
            if (statsList) {
                const statsMap = new Map(
                    statsList.map((item) => [item.path.toString(), item.stats] as const)
                )

                for (let index = 0; index < directories.length; index++) {
                    directories[index].stats = statsMap.get(parentPaths[index])
                }
            }

            // 并发读取视频文件，减少 NFO 读取等待时间
            videoFiles.push(...(await Promise.all(directories.map((directory) => read(directory)))))

            // 更新文件列表状态
            display.setManageViewFiles(videoFiles)
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

    async function readExtrafanart(
        videoDir: Path,
        video: IVideoFile,
        sourceVideo: IVideoFile
    ): Promise<number> {
        // 读取所有图片文件
        const imgExtPattern = imgExtnames.map((ext) => ext.slice(1)).join(',')
        let extrafanart = await PathHelper.readDirectory(
            videoDir.join('extrafanart'),
            `**/*.{${imgExtPattern}}`,
            {
                onlyFiles: true
            }
        )

        // 按Windows文件名顺序排序（自然排序）
        extrafanart = extrafanart.sort((a, b) => {
            // Windows文件名排序规则：先按数字部分排序，再按字母排序
            return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
        })

        video.extrafanart = []
        sourceVideo.extrafanart = []
        for (const file of extrafanart) {
            // 因为是拷贝之后的异步执行，所以两个都要有
            video.extrafanart.push(file)
            sourceVideo.extrafanart.push(file)
        }

        return video.extrafanart.length
    }

    return {
        /**
         * 扫描目录下的文件
         * @remarks 忽略extrafanart目录下的文件
         */
        runScanFiles,
        /**
         * 读取extrafanart目录下的文件
         */
        readExtrafanart
    }
}

export async function preScan() {
    const settings = settingsStore()
    const paths = Object.values(settings.scraperPath)

    await Promise.all(
        paths.map((path) =>
            PathHelper.readDirectory(path, '**/', {
                onlyDirectories: true
            })
        )
    )

    LogHelper.debug('预扫描完成')
}

/**
 * 获取文件更新时间
 * @param stats 文件状态
 * @param field 时间字段
 */
function getFileUpdateTime(stats: IStats, field: 'ctime' | 'mtime' = 'mtime'): number {
    return dayjs(stats[field]).valueOf()
}

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
 * 解析NFO里的图片路径
 * @param video 视频数据
 * @param imagePath NFO中的图片路径
 */
function resolveNfoImagePath(video: IVideoFile, imagePath: string | null): string | null {
    if (!imagePath) return null

    const path = PathHelper.newPath(imagePath)
    const normalizedPath = path.isAbsolute ? path : video.dir.join(imagePath)
    return normalizedPath.toString()
}

/**
 * 将缓存中的NFO数据写回video对象
 * @param video 视频数据
 * @param data NFO缓存数据
 */
function applyNfoCacheData(video: IVideoFile, data: INfoCacheData): void {
    const { num, actor, tag, genre, poster, thumb, fanart, ...rest } = data

    Object.assign(video, rest, {
        num: { ...num },
        actor: actor.map((item) => ({ ...item })),
        tag: [...tag],
        genre: [...genre],
        poster: resolveNfoImagePath(video, poster),
        thumb: resolveNfoImagePath(video, thumb),
        fanart: resolveNfoImagePath(video, fanart)
    })
}

/**
 * 从movie节点中提取可缓存的数据
 * @param movie NFO的movie节点
 */
function createNfoCacheData(movie: any): INfoCacheData {
    const data: INfoCacheData = {
        scraperName: normalizeTextValue(movie.scraperName).trim(),
        title: StringHelper.decodeHtmlEntity(normalizeTextValue(movie.title)) || '',
        originaltitle: StringHelper.decodeHtmlEntity(normalizeTextValue(movie.originaltitle)) || '',
        sorttitle: StringHelper.decodeHtmlEntity(normalizeTextValue(movie.sorttitle)) || '',
        tagline: StringHelper.decodeHtmlEntity(normalizeTextValue(movie.tagline)) || '',
        plot: StringHelper.decodeHtmlEntity(normalizeTextValue(movie.plot)) || '',
        mpaa: normalizeTextValue(movie.mpaa).trim(),
        rating: normalizeTextValue(movie.rating).trim(),
        director: normalizeTextValue(movie.director).trim(),
        studio: normalizeTextValue(movie.studio).trim(),
        maker: normalizeTextValue(movie.maker).trim(),
        set: normalizeTextValue(movie.set).trim(),
        year: normalizeTextValue(movie.year).trim(),
        premiered: normalizeTextValue(movie.premiered).trim(),
        releasedate: normalizeTextValue(movie.releasedate).trim(),
        num: {},
        actor: [],
        tag: [],
        genre: [],
        poster: normalizeTextValue(movie.poster).trim() || null,
        thumb: normalizeTextValue(movie.thumb).trim() || null,
        fanart: normalizeTextValue(movie.fanart).trim() || null,
        remarks: normalizeTextValue(movie.remarks).trim() || ''
    }

    // 处理编号信息
    if (movie.num) {
        const nums = Array.isArray(movie.num) ? movie.num : [movie.num]

        try {
            for (const num of nums) {
                const source = normalizeTextValue(num.source).trim()
                const value = normalizeTextValue(num.value).trim()
                if (!source || !value) continue

                data.num[source] = value
            }
        } catch {}
    }

    // 处理演员信息
    if (movie.actor) {
        const actors = Array.isArray(movie.actor) ? movie.actor : [movie.actor]
        data.actor = actors.map((actor: { name: unknown; thumb: unknown; role: unknown }) => ({
            name: normalizeTextValue(actor.name).trim(),
            imgUrl: normalizeTextValue(actor.thumb).trim(),
            role: normalizeTextValue(actor.role).trim()
        }))
    }

    // 处理标签
    if (movie.tag) {
        const tags = Array.isArray(movie.tag) ? movie.tag : [movie.tag]
        data.tag = tags.map((tag: unknown) => normalizeTextValue(tag)).filter(Boolean)
    }

    // 处理类型
    if (movie.genre) {
        const genres = Array.isArray(movie.genre) ? movie.genre : [movie.genre]
        data.genre = genres.map((genre: unknown) => normalizeTextValue(genre)).filter(Boolean)
    }

    return data
}

/**
 * 读取NFO文件为video
 */
async function read(directory: IDirectory): Promise<IVideoFile> {
    const video = createVideoFile(directory.stats?.birthtime, directory.video, directory.nfo)
    const nfoPath = video.nfoPath

    // 有nfo文件的情况
    if (nfoPath) {
        const nfoPathText = nfoPath.toString()
        const cache = await DataHelper.get<INfoCacheRecord>(NFO_CACHE_DATA_NAME, nfoPathText)
        const actualCtime = directory.nfo ? getFileUpdateTime(directory.nfo.stats, 'ctime') : 0
        const actualMtime = directory.nfo ? getFileUpdateTime(directory.nfo.stats, 'mtime') : 0

        if (
            cache?.data &&
            typeof cache.updateTime === 'number' &&
            actualCtime <= cache.updateTime &&
            actualMtime <= cache.updateTime
        ) {
            // 使用data缓存记录
            applyNfoCacheData(video, cache.data)
        } else {
            // 打开文件
            const re = await TaskHelper.tryExecute(() => PathHelper.readFile(nfoPath))
            if (re.hasError) {
                LogHelper.warn(`读取NFO文件失败：${nfoPath.toString()} \n`, re.error)
                return video
            }

            const obj: any = convert({ encoding: 'UTF-8' }, re.result, { format: 'object' })
            if (!obj || !obj.movie) {
                LogHelper.warn(`读取NFO文件失败（数据格式错误）：${nfoPath.toString()}`)
                return video
            }

            const data = createNfoCacheData(obj.movie)
            applyNfoCacheData(video, data)

            await DataHelper.set(NFO_CACHE_DATA_NAME, nfoPathText, {
                updateTime: Math.max(actualCtime, actualMtime),
                data
            })
        }
    } else {
        // 如果没有nfo文件，title为文件名
        video.title = directory.video.name
        video.originaltitle = directory.video.name
        video.sorttitle = directory.video.name
    }

    // 如果NFO没有记录图片，则回退到目录内约定命名的图片
    if (!video.poster && directory.img.poster) {
        video.poster = directory.img.poster.path
    }
    if (!video.thumb && directory.img.thumb) {
        video.thumb = directory.img.thumb.path
    }
    if (!video.fanart && directory.img.fanart) {
        video.fanart = directory.img.fanart.path
    }

    return video
}
