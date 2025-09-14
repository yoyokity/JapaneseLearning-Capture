import { DebugHelper, ImageHelper, NetHelper, Path, PathHelper } from '@renderer/helper'
import { IVideo, IVideoFile } from './Video'
import { Nfo } from './Nfo'
import { settingsStore } from '@renderer/stores'

/**
 * 模块导入类型接口
 */
interface IModuleType {
	[key: string]: {
		default: IScraper
	}
}

export interface IScraper {
	/**
	 * 刮削器名称
	 */
	scraperName: string
	/**
	 * 检查连接
	 */
	checkConnect(): Promise<boolean>
	/**
	 * 刮削视频信息
	 */
	scraperVideo(video: IVideo): Promise<IVideo>
	/**
	 * 创建目录，创建nfo文件，移动视频
	 * @param scraperPath 刮削器输出路径
	 * @param videoFile 新视频文件信息
	 * @param sourceVideoFile 源视频文件信息
	 * @returns 是否创建成功
	 */
	createDirectory(scraperPath: Path, video: IVideo, sourceVideoFile: IVideoFile): Promise<boolean>
	/**
	 * 下载图片
	 * @param videoDir 视频目录
	 * @param video 视频信息
	 */
	downloadImage(videoDir: Path, video: IVideo): Promise<void>
}

export class Scraper {
	/**
	 * 刮削器实例对象列表
	 */
	static instances: IScraper[] = (() => {
		const instances: IScraper[] = []
		const modules = import.meta.glob('../plugins/*.ts', { eager: true }) as IModuleType
		for (const path in modules) {
			const module = modules[path]
			const scraper = module.default

			// 检查scraper是否符合IScraper接口
			if (!scraper || typeof scraper !== 'object') {
				DebugHelper.error(`${path} 导出的默认对象不是有效对象，此刮削器加载失败`)
				continue
			}

			// 检查必要的属性和方法
			if (!scraper.scraperName || typeof scraper.scraperName !== 'string') {
				DebugHelper.error(`${path} 缺少有效的scraperName属性，此刮削器加载失败`)
				continue
			}

			if (!scraper.checkConnect || typeof scraper.checkConnect !== 'function') {
				DebugHelper.error(`${path} 缺少有效的checkConnect方法，此刮削器加载失败`)
				continue
			}

			if (!scraper.scraperVideo || typeof scraper.scraperVideo !== 'function') {
				DebugHelper.error(`${path} 缺少有效的scraperVideo方法，此刮削器加载失败`)
				continue
			}

			if (!scraper.createDirectory || typeof scraper.createDirectory !== 'function') {
				DebugHelper.error(`${path} 缺少有效的createDirectory方法，此刮削器加载失败`)
				continue
			}

			if (!scraper.downloadImage || typeof scraper.downloadImage !== 'function') {
				DebugHelper.error(`${path} 缺少有效的downloadImage方法，此刮削器加载失败`)
				continue
			}

			instances.push(scraper)
		}
		return instances
	})()

	/**
	 * 获取当前刮削器路径
	 */
	static getCurrentScraperPath() {
		const settings = settingsStore()
		return settings.scraperPath[settings.currentScraper]
	}

	/**
	 * 获取当前刮削器实例
	 */
	static getCurrentScraperInstance() {
		const settings = settingsStore()
		return Scraper.instances.find((scraper) => scraper.scraperName === settings.currentScraper)
	}

	/**
	 * 默认创建目录的方法
	 * @param scraperPath 刮削器输出路径
	 * @param video 视频文件信息
	 * @param sourceVideoFile 源视频文件信息
	 * @param fileName 文件名，最终目录名也是这个。默认使用视频文件的title
	 * @param subDirectory 是否在scraperPath和videoFile.dir之间添加一层或多层目录，如果为true，则目录结构为 scraperOutDir/subDirectory/videoDir
	 * @returns 是否创建成功
	 */
	static async defaultCreateDirectory(
		scraperPath: Path,
		video: IVideo,
		sourceVideoFile: IVideoFile,
		fileName: ((video: IVideo) => string) | null = null,
		subDirectory: ((video: IVideo) => string) | null = null
	): Promise<boolean> {
		//文件名
		const _fileName = fileName ? fileName(video) : video.title
		//中间目录
		const _subDirectory = subDirectory ? subDirectory(video) : ''
		//最终目录
		const videoDir = scraperPath.join(_subDirectory).join(_fileName)

		//视频path
		const _videoPath = videoDir.join(_fileName + sourceVideoFile.extname)
		//nfo path
		const _nfoPath = videoDir.join(_fileName + '.nfo')

		//创建最终目录
		let re = await PathHelper.createDirectory(videoDir)
		if (!re) return false

		//将视频文件移动到新目录
		re = await PathHelper.move(sourceVideoFile.path, _videoPath)
		if (!re) return false

		//创建nfo文件
		const nfo = Nfo.create(video)
		await nfo.save(_nfoPath)

		return true
	}

	/**
	 * 默认下载图片的方法
	 * @param videoDir 视频目录
	 * @param video 视频信息
	 * @param httpHeaders 请求头，默认不使用
	 * @param anime 是否为动漫图片，默认为false
	 */
	static async defaultDownloadImage(
		videoDir: Path,
		video: IVideo,
		httpHeaders?: Record<string, string>,
		anime: boolean = false
	): Promise<void> {
		const posterPath = videoDir.join('poster.jpg')
		const thumbPath = videoDir.join('thumb.jpg')
		const fanartPath = videoDir.join('fanart.jpg')

		if (video.poster) {
			if (video.poster instanceof URL) {
				//如果是url
				const re = await NetHelper.get(video.poster.toString(), 'buffer', httpHeaders)
				if (re.ok) {
					await ImageHelper.saveImage(re.body, posterPath)
				}
			} else {
				//如果是path，则直接复制
				await PathHelper.copy(video.poster, posterPath)
			}
		}

		if (video.thumb) {
			if (video.thumb instanceof URL) {
				//如果是url
				const re = await NetHelper.get(video.thumb.toString(), 'buffer', httpHeaders)
				if (re.ok) {
					await ImageHelper.saveImage(re.body, thumbPath)
				}
			} else {
				//如果是path，则直接复制
				await PathHelper.copy(video.thumb, thumbPath)
			}
		}

		if (video.fanart) {
			if (video.fanart instanceof URL) {
				//如果是url
				const re = await NetHelper.get(video.fanart.toString(), 'buffer', httpHeaders)
				if (re.ok) {
					await ImageHelper.superResolutionImage(re.body, fanartPath, anime)
				}
			} else {
				//如果是path，则直接复制
				await PathHelper.copy(video.fanart, fanartPath)
			}
		}

		//Extrafanart
		const extrafanartDir = videoDir.join('extrafanart')
		let re = await PathHelper.createDirectory(extrafanartDir)
		if (re) {
			for (let index = 1; index <= video.extrafanart.length; index++) {
				const extrafanart = video.extrafanart[index - 1]
				if (extrafanart instanceof URL) {
					const re = await NetHelper.get(extrafanart.toString(), 'buffer', httpHeaders)
					if (re.ok) {
						await ImageHelper.saveImage(
							re.body,
							extrafanartDir.join(`extrafanart-${index}.jpg`)
						)
					}
				} else {
					await PathHelper.copy(
						extrafanart,
						extrafanartDir.join(`extrafanart-${index}.jpg`)
					)
				}
			}
		}
	}
}
