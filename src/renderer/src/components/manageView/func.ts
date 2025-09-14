import { DebugHelper, Path, PathHelper, videoExtensions } from '@renderer/helper'
import { createVideoFile, IVideoFile, Scraper } from '@renderer/scraper'
import { convert } from 'xmlbuilder2'
import { globalStatesStore } from '@renderer/stores'
import { Ipc } from '@renderer/ipc'

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
			videoFiles.push(await read(file, files))
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
async function read(path: string, files: string[]): Promise<IVideoFile> {
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
	video.poster = movie.poster || ''
	video.thumb = movie.thumb || ''
	video.fanart = movie.fanart || ''
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
	if (!movie.poster) {
		//从文件列表中获取poster
		const poster = files.filter(
			(file) => file.includes(video.dir.toString()) && file.includes('poster')
		)
		if (poster.length > 0) {
			video.poster = PathHelper.newPath(poster[0])
		}
	} else if (!PathHelper.newPath(movie.poster).isAbsolute) {
		video.poster = video.dir.join(movie.poster)
	}

	if (!movie.thumb) {
		const thumb = files.filter(
			(file) => file.includes(video.dir.toString()) && file.includes('thumb')
		)
		if (thumb.length > 0) {
			video.thumb = PathHelper.newPath(thumb[0])
		}
	} else if (!PathHelper.newPath(movie.thumb).isAbsolute) {
		video.thumb = video.dir.join(movie.thumb)
	}

	if (!movie.fanart) {
		const fanart = files.filter(
			(file) => file.includes(video.dir.toString()) && file.includes('fanart')
		)
		if (fanart.length > 0) {
			video.fanart = PathHelper.newPath(fanart[0])
		}
	} else if (!PathHelper.newPath(movie.fanart).isAbsolute) {
		video.fanart = video.dir.join(movie.fanart)
	}

	return video
}

/**
 * 读取extrafanart目录下的文件
 */
export async function readExtrafanart(videoDir: Path, video: IVideoFile): Promise<number> {
	const extrafanart = await PathHelper.readDirectory(
		videoDir.join('extrafanart'),
		'file',
		undefined,
		undefined,
		1
	)

	for (const file of extrafanart) {
		const filePath = PathHelper.newPath(file)
		const ext = filePath.extname.toLowerCase()
		if (ext === '.jpg' || ext === '.png' || ext === '.jpeg' || ext === '.webp') {
			video.extrafanart.push(filePath)
		}
	}

	return video.extrafanart.length
}
