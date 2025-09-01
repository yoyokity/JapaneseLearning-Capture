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
			instances.push(scraper)
		}
		return instances
	})()
}
