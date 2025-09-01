import { create, convert } from 'xmlbuilder2'
import { type XMLBuilder } from 'xmlbuilder2/lib/interfaces'
import { IVideo } from './type'
import { PathHelper } from '@renderer/helper'

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
	static async read(path: string): Promise<IVideo | null> {
		const data = await PathHelper.readFile(path, 'utf-8')
		if (!data) return null
		const obj: any = convert({ encoding: 'UTF-8' }, data, { format: 'object' })
		if (!obj || !obj.movie) return null

		const movie = obj.movie
		const video: IVideo = {
			scraperName: movie.scraperName?._text || '',
			title: movie.title?._text || '',
			originaltitle: movie.originaltitle?._text || '',
			sorttitle: movie.sorttitle?._text || '',
			tagline: movie.tagline?._text || '',
			plot: movie.plot?._text || '',
			num: movie.num?._text || '',
			mpaa: movie.mpaa?._text || '',
			rating: movie.rating?._text || '',
			director: movie.director?._text || '',
			actor: [],
			studio: movie.studio?._text || '',
			maker: movie.maker?._text || '',
			set: movie.set?._text || '',
			tag: [],
			genre: [],
			year: movie.year?._text || '',
			premiered: movie.premiered?._text || '',
			releasedate: movie.releasedate?._text || ''
		}

		// 处理演员信息
		if (movie.actor) {
			const actors = Array.isArray(movie.actor) ? movie.actor : [movie.actor]
			video.actor = actors.map((actor) => ({
				name: actor.name?._text || '',
				imgUrl: actor.thumb?._text || ''
			}))
		}

		// 处理标签
		if (movie.tag) {
			const tags = Array.isArray(movie.tag) ? movie.tag : [movie.tag]
			video.tag = tags.map((tag) => tag._text || '')
		}

		// 处理类型
		if (movie.genre) {
			const genres = Array.isArray(movie.genre) ? movie.genre : [movie.genre]
			video.genre = genres.map((genre) => genre._text || '')
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
