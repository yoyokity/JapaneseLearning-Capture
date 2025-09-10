import { create } from 'xmlbuilder2'
import { type XMLBuilder } from 'xmlbuilder2/lib/interfaces'
import { IVideo } from './Video'
import { Path, PathHelper } from '@renderer/helper'
import { isString } from 'es-toolkit'

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
			if (isString(video[node]) && video[node] !== '') {
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
			if (value.imgUrl) actor.ele('thumb').txt(value.imgUrl)
			if (value.role) actor.ele('role').txt(value.role)
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

	toString() {
		return this.instance.end({ prettyPrint: true })
	}

	/**
	 * 保存 NFO 文件
	 * @param path 文件路径
	 */
	async save(path: string | Path) {
		await PathHelper.writeFile(path, this.toString())
	}
}
