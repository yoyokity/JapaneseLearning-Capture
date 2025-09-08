import { create, convert } from 'xmlbuilder2'
import { type XMLBuilder } from 'xmlbuilder2/lib/interfaces'
import { IVideo } from './type'
import { PathHelper } from '@renderer/helper'
import { IVideoFile } from '@renderer/components/manageView/type'

/**
 * NFO 文件生成器
 */
export class Nfo {
	private instance: XMLBuilder

	private constructor(xmlObj = null) {
		this.instance = create({ version: '1.0', encoding: 'UTF-8' })
		if (xmlObj) {
			this.instance.ele(xmlObj)
		}
	}

	/**
	 * 通过video生成NFO对象
	 */
	static create(video: IVideo) {
		function addElement(root: XMLBuilder, node: string) {
			if (video[node] !== '') {
				root.ele(node).txt(video[node])
			}
		}

		const nfo = new Nfo()
		const root = nfo.instance.ele('movie')

		addElement(root, 'scraperName')
		addElement(root, 'title')
		addElement(root, 'originaltitle')
		addElement(root, 'sorttitle')
		addElement(root, 'tagline')
		addElement(root, 'plot')
		addElement(root, 'num')
		addElement(root, 'mpaa')
		addElement(root, 'rating')
		addElement(root, 'director')

		for (const value of video.actor) {
			const actor = root.ele('actor')
			actor.ele('name').txt(value.name)
			if (value.imgUrl) {
				actor.ele('thumb').txt(value.imgUrl)
			}
		}

		addElement(root, 'studio')
		addElement(root, 'maker')
		addElement(root, 'set')

		for (let tag of video.tag) {
			root.ele('tag').txt(tag)
		}

		for (let genre of video.genre) {
			root.ele('genre').txt(genre)
		}

		addElement(root, 'year')
		addElement(root, 'premiered')
		addElement(root, 'releasedate')
		root.ele('poster').txt('poster.jpg')
		root.ele('thumb').txt('thumb.jpg')
		root.ele('fanart').txt('fanart.jpg')

		return nfo
	}

	/**
	 * 读取NFO文件为video
	 */
	static async read(path: string, files: string[]): Promise<IVideoFile> {
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

		const data = await PathHelper.readFile(nfoPath, 'utf-8')
		if (!data) return video
		const obj: any = convert({ encoding: 'UTF-8' }, data, { format: 'object' })
		if (!obj || !obj.movie) return video

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

	toString() {
		return this.instance.end({ prettyPrint: true })
	}

	/**
	 * 保存 NFO 文件
	 * @param path 文件路径
	 */
	async save(path: string) {
		await PathHelper.writeFile(path, this.toString())
	}
}
