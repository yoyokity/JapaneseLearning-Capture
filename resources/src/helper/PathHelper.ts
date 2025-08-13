import * as pathe from 'pathe'
import { filesystem } from '@neutralinojs/lib'
import { DebugHelper } from '@/helper/DebugHelper.ts'

export class Path {
	private readonly _path: string

	constructor(...paths: string[]) {
		this._path = pathe.resolve(...paths)
	}

	/**
	 * 文件名，如果为目录则返回最后一级目录
	 */
	get filename() {
		return pathe.basename(this._path)
	}

	/**
	 * 文件扩展名，如果为目录则返回''
	 */
	get extname() {
		return pathe.extname(this._path)
	}

	/**
	 * 不带扩展名的文件名，如果为目录则返回最后一级目录
	 */
	get basename() {
		return pathe.basename(this._path, this.extname)
	}

	/**
	 * 上级目录
	 */
	get parent() {
		return new Path(pathe.dirname(this._path))
	}

	toString() {
		return this._path
	}

	/**
	 * 路径拼接
	 */
	join(...paths: string[]) {
		return new Path(pathe.join(this._path, ...paths))
	}

	/**
	 * 是否为绝对路径
	 */
	isAbsolute() {
		return pathe.isAbsolute(this._path)
	}

	/**
	 * 判断path是否存在于磁盘上，用时300ms左右
	 */
	async isExist() {
		return !!(await this.getSats())
	}

	/**
	 * 判断path是否为目录
	 *
	 * 如果是.开头的目录，请用stringBased=false来判断，否则会被判断为文件
	 * @param [stringBased=true] 是否仅使用字符串判断，否则通过后端判断，用时300ms左右
	 */
	async isDir(stringBased: boolean = true) {
		if (stringBased) {
			// 通过字符串判断，检查路径是否以/或\结尾，或者没有扩展名
			return (
				this._path.endsWith('/') || this._path.endsWith('\\') || !pathe.extname(this._path)
			)
		} else {
			// 通过filesystem.getStats判断
			const re = await this.getSats()
			return re && re.isDirectory
		}
	}

	/**
	 * 判断path是否为文件
	 *
	 * 如果是.开头的目录，请用stringBased=false来判断，否则会被判断为文件
	 * @param [stringBased=true] 是否仅使用字符串判断，否则通过后端判断，用时300ms左右
	 */
	async isFile(stringBased: boolean = true) {
		if (stringBased) {
			// 通过字符串判断，检查路径是否有扩展名且不以/或\结尾
			return (
				!this._path.endsWith('/') &&
				!this._path.endsWith('\\') &&
				!!pathe.extname(this._path)
			)
		} else {
			// 通过filesystem.getStats判断
			const re = await this.getSats()
			return re && re.isFile
		}
	}

	private async getSats() {
		try {
			return await filesystem.getStats(this._path)
		} catch (e: any) {
			return false
		}
	}
}

/**
 * 路径、文件相关
 */
export class PathHelper {
	/**
	 * 当前的工作目录，即exe所在路径
	 */
	static get appPath() {
		return new Path(window.NL_CWD)
	}

	/**
	 * 用于储存日志的目录
	 */
	static get logPath() {
		return this.appPath.join('.log')
	}

	/**
	 * 用于储存临时文件的目录
	 */
	static get tempPath() {
		return this.appPath.join('.tmp')
	}

	/**
	 * 创建一个Path路径
	 */
	static newPath(...paths: string[]) {
		return new Path(...paths)
	}

	/**
	 * 替换掉路径中的非法字符
	 */
	static sanitizePath(path: Path | string): Path {
		if (typeof path === 'string') path = new Path(path)

		const fullWidthMap = {
			'?': '？',
			'"': '＂',
			'<': '＜',
			'>': '＞',
			'|': '｜'
		}

		// 1. 替换非法字符为全角符号
		let sanitized = path.toString().replace(/[?"<>|]/g, (char) => {
			return fullWidthMap[char as keyof typeof fullWidthMap] || ''
		})

		// 2. 移除开头和结尾的非法字符（如空格、点）
		return new Path(sanitized.replace(/[.\s]+$/, ''))
	}

	/**
	 * 递归创建目录
	 * @description 如果目录已存在，则跳过
	 * @remarks 最短用时300ms左右
	 */
	static async createDir(path: Path | string) {
		if (typeof path === 'string') path = new Path(path)

		// 如果目录已存在，则不需要创建
		if (await path.isExist()) return

		const re = await DebugHelper.tryExecute(filesystem.createDirectory, path.toString())
		if (re.error === null) {
			return true
		} else {
			DebugHelper.error(`创建目录失败：`, re.error)
			return false
		}
	}

	/**
	 * 读取目录内容
	 * @param path 目录路径
	 * @param [recursive=true] 是否递归读取子目录
	 * @remarks 用时300ms-1s左右
	 */
	static async readDir(path: Path | string, recursive: boolean = true) {
		if (typeof path === 'string') path = new Path(path)

		const re = await DebugHelper.tryExecute(filesystem.readDirectory, path.toString(), {
			recursive
		})

		if (re.error === null) {
			return re.result
		} else {
			DebugHelper.error(`读取目录失败：`, re.error)
			return []
		}
	}

	/**
	 * 删除文件或目录
	 * @remarks 用时300ms左右
	 */
	static async remove(path: Path | string) {
		if (typeof path === 'string') path = new Path(path)

		const re = await DebugHelper.tryExecute(filesystem.remove, path.toString())
		if (re.error === null) {
			return true
		} else {
			DebugHelper.error(`删除文件或目录失败：`, re.error)
			return false
		}
	}

	/**
	 * 写入文本文件。如果文件不存在，则创建一个
	 * @param path 文件路径
	 * @param data 文件内容
	 * @description 如果目标路径的父目录不存在，则会自动创建
	 * @remarks 用时1ms左右
	 */
	static async writeFile(path: Path | string, data: string) {
		if (typeof path === 'string') path = new Path(path)

		// 如果父目录不存在，则先创建
		if (!(await path.parent.isExist())) {
			await this.createDir(path.parent)
		}

		const re = await DebugHelper.tryExecute(filesystem.writeFile, path.toString(), data)
		if (re.error === null) {
			return true
		} else {
			DebugHelper.error(`写入文件失败：`, re.error)
			return false
		}
	}

	/**
	 * 追加文本到文件。如果文件不存在，则创建一个
	 * @param path 文件路径
	 * @param data 要追加的内容
	 * @description 需要自行判断父目录是否存在（毕竟每次都判断的话会影响性能）
	 * @remarks 创建文件用时1ms左右，追加用时0.6ms左右
	 */
	static async appendFile(path: Path | string, data: string) {
		if (typeof path === 'string') path = new Path(path)

		const re = await DebugHelper.tryExecute(filesystem.appendFile, path.toString(), data)
		if (re.error === null) {
			return true
		} else {
			DebugHelper.error(`追加文件内容失败：`, re.error)
			return false
		}
	}

	/**
	 * 写入二进制文件。如果文件不存在，则创建一个
	 * @param path 文件路径
	 * @param data 二进制数据
	 * @description 如果目标路径的父目录不存在，则会自动创建
	 * @remarks 用时1ms左右
	 */
	static async writeBinaryFile(path: Path | string, data: ArrayBuffer) {
		if (typeof path === 'string') path = new Path(path)

		// 如果父目录不存在，则先创建
		if (!(await path.parent.isExist())) {
			await this.createDir(path.parent)
		}

		const re = await DebugHelper.tryExecute(filesystem.writeBinaryFile, path.toString(), data)
		if (re.error === null) {
			return true
		} else {
			DebugHelper.error(`写入二进制文件失败：`, re.error)
			return false
		}
	}

	/**
	 * 追加二进制数据到文件。如果文件不存在，则创建一个
	 * @param path 文件路径
	 * @param data 要追加的二进制数据
	 * @description 需要自行判断父目录是否存在（毕竟每次都判断的话会影响性能）
	 * @remarks 创建文件用时1ms左右，追加用时0.6ms左右
	 */
	static async appendBinaryFile(path: Path | string, data: ArrayBuffer) {
		if (typeof path === 'string') path = new Path(path)

		const re = await DebugHelper.tryExecute(filesystem.appendBinaryFile, path.toString(), data)
		if (re.error === null) {
			return true
		} else {
			DebugHelper.error(`追加二进制文件内容失败：`, re.error)
			return false
		}
	}

	/**
	 * 读取文本文件
	 * @param path 文件路径
	 * @param options 选项，可选参数 pos: 文件指针位置（字节），size: 读取缓冲区大小（字节）
	 * @remarks 用时300ms左右
	 */
	static async readFile(path: Path | string, options?: { pos?: number; size?: number }) {
		if (typeof path === 'string') path = new Path(path)

		const re = await DebugHelper.tryExecute(filesystem.readFile, path.toString(), options)
		if (re.error === null) {
			return re.result
		} else {
			DebugHelper.error(`读取文件失败：`, re.error)
			return null
		}
	}

	/**
	 * 读取二进制文件
	 * @param path 文件路径
	 * @param options 选项，可选参数 pos: 文件指针位置（字节），size: 读取缓冲区大小（字节）
	 * @remarks 用时300ms左右
	 */
	static async readBinaryFile(path: Path | string, options?: { pos?: number; size?: number }) {
		if (typeof path === 'string') path = new Path(path)

		const re = await DebugHelper.tryExecute(filesystem.readBinaryFile, path.toString(), options)
		if (re.error === null) {
			return re.result
		} else {
			DebugHelper.error(`读取二进制文件失败：`, re.error)
			return null
		}
	}

	/**
	 * 复制文件或目录到新的位置
	 * @param source 源文件或目录路径
	 * @param destination 目标路径
	 * @param [recursive=true] 是否递归复制子目录
	 * @param [overwrite=true] 是否覆盖同名文件
	 * @param [skip=false] 是否跳过同名文件
	 * @description 如果目标路径的父目录不存在，会自动创建
	 */
	static async copy(
		source: Path | string,
		destination: Path | string,
		recursive: boolean = true,
		overwrite: boolean = true,
		skip: boolean = false
	) {
		if (typeof source === 'string') source = new Path(source)
		if (typeof destination === 'string') destination = new Path(destination)

		// 如果目标路径的父目录不存在，则创建
		if (!(await destination.parent.isExist())) {
			const createDirResult = await this.createDir(destination.parent)
			if (!createDirResult) {
				DebugHelper.error(
					`复制文件或目录失败：无法创建目标父目录。源路径：${source}, 目标路径：${destination}`
				)
				return false
			}
		}

		try {
			const re = await DebugHelper.tryExecute(
				filesystem.copy,
				source.toString(),
				destination.toString(),
				{
					recursive,
					overwrite,
					skip
				}
			)
			if (re.error === null) {
				return true
			} else {
				DebugHelper.error(`复制文件或目录失败：`, re.error)
				return false
			}
		} catch (error) {
			DebugHelper.error(`复制文件或目录失败：`, error)
			return false
		}
	}

	/**
	 * 移动文件或目录到新的位置
	 * @param source 源文件或目录路径
	 * @param destination 目标路径
	 * @description 如果目标路径的父目录不存在，会自动创建
	 */
	static async move(source: Path | string, destination: Path | string) {
		if (typeof source === 'string') source = new Path(source)
		if (typeof destination === 'string') destination = new Path(destination)

		// 如果目标路径的父目录不存在，则创建
		if (!(await destination.parent.isExist())) {
			const createDirResult = await this.createDir(destination.parent)
			if (!createDirResult) {
				DebugHelper.error(
					`移动文件或目录失败：无法创建目标父目录。源路径：${source}, 目标路径：${destination}`
				)
				return false
			}
		}

		try {
			const re = await DebugHelper.tryExecute(
				filesystem.move,
				source.toString(),
				destination.toString()
			)
			if (re.error === null) {
				return true
			} else {
				DebugHelper.error(`移动文件或目录失败：`, re.error)
				return false
			}
		} catch (error) {
			DebugHelper.error(`移动文件或目录失败：`, error)
			return false
		}
	}
}
