import { HttpClient } from '@/helper/request.ts'
import { PathLib } from '@/helper/path.ts'
import { Debug } from '@/helper/debug.ts'

export class Helper {
	/**
	 * http请求相关
	 */
	static request = HttpClient

	/**
	 * 路径相关
	 */
	static path = new PathLib()

	/**
	 * debug相关，包括日志打印等
	 */
	static debug = new Debug()

	/**
	 * 初始化，把该创建的目录创建一下
	 */
	static init() {
		this.path.createDir(this.path.logPath)
		this.path.createDir(this.path.tempPath)
	}
}

export * from '@/helper/path.ts'
