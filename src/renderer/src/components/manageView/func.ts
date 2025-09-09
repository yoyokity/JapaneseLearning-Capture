import { DebugHelper, PathHelper, videoExtensions } from '@renderer/helper'
import { IVideoFile } from './type'
import { convert } from 'xmlbuilder2'
import { globalStatesStore, settingsStore } from '@renderer/stores'
import { Ipc } from '@renderer/ipc'

/**
 * 扫描目录下的文件
 * @remarks 忽略extrafanart目录下的文件
 */
export async function scanFiles(path: string): Promise<IVideoFile[]> {
	const globalStates = globalStatesStore()

	globalStates.manageViewLoading = true

	const videoFiles: IVideoFile[] = []
	const files = await PathHelper.readDirectory(path, 'file', undefined, ['**/extrafanart/**'])

	// 过滤出视频文件
	for (const file of files.filter((file) => {
		const ext = PathHelper.newPath(file).extname.toLowerCase()
		return videoExtensions.includes(ext)
	})) {
		videoFiles.push(await read(file, files))
	}

	//排序
	videoFiles.sort(videoSortFunc)

	globalStates.manageViewLoading = false
	return videoFiles
}

/**
 * 视频排序
 */
export function videoSortFunc(a: IVideoFile, b: IVideoFile) {
	const settings = settingsStore()

	if (settings.manageViewSort === 'title') {
		return a.sorttitle.localeCompare(b.sorttitle, undefined, { sensitivity: 'base' })
	} else if (settings.manageViewSort === 'releasedate') {
		return a.releasedate.localeCompare(b.releasedate, undefined, { sensitivity: 'base' })
	} else if (settings.manageViewSort === 'title_reverse') {
		return b.sorttitle.localeCompare(a.sorttitle, undefined, { sensitivity: 'base' })
	} else if (settings.manageViewSort === 'releasedate_reverse') {
		return b.releasedate.localeCompare(a.releasedate, undefined, { sensitivity: 'base' })
	}
	return 0
}

/**
 * 读取NFO文件为video
 */
async function read(path: string, files: string[]): Promise<IVideoFile> {
	const _path = PathHelper.newPath(path)
	const nfoPath = _path.parent.join(_path.basename + '.nfo')

	const video: IVideoFile = {
		path: _path,
		dir: _path.parent,
		fileName: _path.basename,
		extname: _path.extname,
		nfoPath: nfoPath,
		poster: '',
		thumb: '',
		fanart: '',
		//
		scraperName: '',
		title: '',
		originaltitle: '',
		sorttitle: '',
		tagline: '',
		plot: '',
		num: '',
		mpaa: '',
		rating: '',
		director: '',
		actor: [],
		studio: '',
		maker: '',
		set: '',
		tag: [],
		genre: [],
		year: '',
		premiered: '',
		releasedate: ''
	}

	//打开文件
	const re = await DebugHelper.tryExecute(Ipc.filesystem.readFile, nfoPath.toString(), 'utf-8')
	if (re.hasError) {
		DebugHelper.warn(`读取NFO文件失败：${nfoPath.toString()} \n`, re.error)
		return video
	}

	const obj: any = convert({ encoding: 'UTF-8' }, re.result, { format: 'object' })
	if (!obj || !obj.movie) {
		DebugHelper.warn(`读取NFO文件失败（数据格式错误）：${nfoPath.toString()}`)
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
			imgUrl: actor.thumb || ''
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
		const poster = files.filter(
			(file) => file.includes(video.dir.toString()) && file.includes('poster')
		)
		if (poster.length > 0) {
			video.poster = poster[0]
		}
	} else if (!PathHelper.newPath(movie.poster).isAbsolute) {
		video.poster = video.dir.join(movie.poster).toString()
	}

	if (!movie.thumb) {
		const thumb = files.filter(
			(file) => file.includes(video.dir.toString()) && file.includes('thumb')
		)
		if (thumb.length > 0) {
			video.thumb = thumb[0]
		}
	} else if (!PathHelper.newPath(movie.thumb).isAbsolute) {
		video.thumb = video.dir.join(movie.thumb).toString()
	}

	if (!movie.fanart) {
		const fanart = files.filter(
			(file) => file.includes(video.dir.toString()) && file.includes('fanart')
		)
		if (fanart.length > 0) {
			video.fanart = fanart[0]
		}
	} else if (!PathHelper.newPath(movie.fanart).isAbsolute) {
		video.fanart = video.dir.join(movie.fanart).toString()
	}

	return video
}
