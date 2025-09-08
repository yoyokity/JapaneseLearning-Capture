import { DebugHelper } from '@renderer/helper'
import { IVideo } from './type'

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
	scraperVideo(): Promise<IVideo>
	/**
	 * 创建目录，创建nfo文件，移动视频
	 */
	createDirectory(): Promise<boolean>
	/**
	 * 下载图片
	 */
	downloadImage(): Promise<boolean>
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
}
