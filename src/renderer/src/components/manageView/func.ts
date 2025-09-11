import { DebugHelper, PathHelper, videoExtensions } from '@renderer/helper'
import { IVideoFile } from './type'
import { convert } from 'xmlbuilder2'
import { globalStatesStore, settingsStore } from '@renderer/stores'
import { Ipc } from '@renderer/ipc'
import Editor from './editor.vue'
import { type DynamicDialogOptions } from 'primevue/dynamicdialogoptions'
import { isEqual } from 'es-toolkit'
import { Nfo } from '@renderer/scraper'

/**
 * 打开视频信息编辑器对话框
 * @param video 视频文件
 * @param dialog 对话框服务实例
 */
export function openEditorDialog(video: IVideoFile, dialog: any, toast: any) {
	dialog.open(Editor, {
		props: {
			modal: true,
			draggable: false,
			showHeader: false,
			contentStyle: {
				marginBottom: '4.5rem',
				marginTop: 'var(--header-height)'
			}
		},
		data: {
			video: video
		},
		onClose: async (opt) => {
			//单纯关闭对话框
			if (!opt?.data) return

			//对话框点击保存
			const newVideo = opt.data as IVideoFile

			//如果视频没有修改，则不保存
			if (isEqual(newVideo, video)) {
				toast.add({
					severity: 'success',
					summary: '未修改，无需保存',
					life: 3000
				})
				return
			}

			//保存到nfo
			const nfo = Nfo.create(newVideo)
			await nfo.save(newVideo.nfoPath.toString())

			toast.add({
				severity: 'success',
				summary: '保存成功！',
				life: 3000
			})

			//重新扫描文件
			scanFiles()
		}
	} as DynamicDialogOptions)
}

/**
 * 扫描目录下的文件
 * @remarks 忽略extrafanart目录下的文件
 */
export async function scanFiles() {
	const globalStates = globalStatesStore()
	const settings = settingsStore()
	globalStates.scanFilesLoading = true

	const path = settings.scraperPath[settings.currentScraper]

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
	globalStates.scanFilesLoading = false
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
		poster: null,
		thumb: null,
		fanart: null,
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
