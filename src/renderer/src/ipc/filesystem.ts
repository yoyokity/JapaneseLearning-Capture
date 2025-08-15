import { invoke } from '@renderer/ipc/func.ts'

/**
 * 文件系统
 */
export const filesystem = {
	/**
	 * 返回app的工作目录，正常情况下就是exe所在的目录
	 */
	appPath: (): Promise<string> => invoke('filesystem:appPath'),

	/**
	 * 返回arsr所在的路径
	 */
	arsrPath: (): Promise<ArsrPath> => invoke('filesystem:arsrPath'),

	/**
	 * 返回userData路径，用于存储用户数据
	 */
	userPath: (): Promise<string> => invoke('filesystem:userPath'),

	/**
	 * 返回logs路径，用于记录日志
	 */
	logsPath: (): Promise<string> => invoke('filesystem:logsPath'),

	/**
	 * 返回temp路径，用于记录临时文件，关闭程序时自动删除
	 */
	tempPath: (): Promise<string> => invoke('filesystem:tempPath'),

	/**
	 * 判断path是否存在于磁盘上
	 * @remarks 用时 <10ms
	 */
	isExist: (path: string): Promise<boolean> => invoke('filesystem:isExist', path),

	/**
	 * 判断path是否为文件
	 * @remarks 用时 <10ms
	 */
	isFile: (path: string): Promise<boolean> => invoke('filesystem:isFile', path),

	/**
	 * 判断path是否为目录
	 * @remarks 用时 <10ms
	 */
	isDirectory: (path: string): Promise<boolean> => invoke('filesystem:isDirectory', path),

	/**
	 * 获取path状态信息
	 * @remarks 用时 <10ms
	 */
	getSatus: (path: string): Promise<Stats> => invoke('filesystem:getStatus', path),

	/**
	 * 路径拼接
	 * @remarks 用时 <10ms
	 */
	join: (...paths: string[]): Promise<string> => invoke('filesystem:join', ...paths),

	/**
	 * 获取文件扩展名，如果为目录则返回''
	 * @description 包含点号
	 * @remarks 用时 <10ms
	 * @param path 文件路径
	 */
	extname: (path: string): Promise<string> => invoke('filesystem:extname', path),

	/**
	 * 获取路径中的文件名
	 * @description 如果path为目录，则返回最后一级目录
	 * @remarks 用时 <10ms
	 * @param path 文件路径
	 * @param ext 可选的文件扩展名，如果提供则会从结果中移除
	 */
	basename: (path: string, ext?: string): Promise<string> =>
		invoke('filesystem:basename', path, ext),

	/**
	 * 获取路径中的目录名
	 * @description 如果path为目录，则返回父目录
	 * @remarks 用时 <10ms
	 * @param path 文件路径
	 */
	dirname: (path: string): Promise<string> => invoke('filesystem:dirname', path),

	/**
	 * 从对象中格式化路径
	 * @remarks 用时 <10ms
	 * @param pathObject 包含路径组件的对象
	 */
	format: (pathObject: FormatInputPathObject): Promise<string> =>
		invoke('filesystem:format', pathObject),

	/**
	 * 判断路径是否为绝对路径
	 * @remarks 用时 <10ms
	 */
	isAbsolute: (path: string): Promise<boolean> => invoke('filesystem:isAbsolute', path),

	/**
	 * 获取to基于from的相对路径
	 * @remarks 用时 <10ms
	 * @param from 源路径
	 * @param to 目标路径
	 * @template
	 * ```ts
	 * const from = '/home/user/app/src';
const to = '/home/user/app/dist';
// 返回: '../dist'
	 * ```
	 */
	relative: (from: string, to: string): Promise<string> => invoke('filesystem:relative', from, to)
}

export interface Stats extends StatsBase<number> {}
interface StatsBase<T> {
	dev: T
	ino: T
	mode: T
	nlink: T
	uid: T
	gid: T
	rdev: T
	size: T
	blksize: T
	blocks: T
	atimeMs: T
	mtimeMs: T
	ctimeMs: T
	birthtimeMs: T
	atime: Date
	mtime: Date
	ctime: Date
	birthtime: Date

	isFile(): boolean

	isDirectory(): boolean

	isBlockDevice(): boolean

	isCharacterDevice(): boolean

	isSymbolicLink(): boolean

	isFIFO(): boolean

	isSocket(): boolean
}

export interface FormatInputPathObject {
	/**
	 * 路径的根部分，例如 '/' 或 'c:\'
	 */
	root?: string | undefined
	/**
	 * 完整的目录路径，例如 '/home/user/dir' 或 'c:\path\dir'
	 */
	dir?: string | undefined
	/**
	 * 包含扩展名（如果有）的文件名，例如 'index.html'
	 */
	base?: string | undefined
	/**
	 * 文件扩展名（如果有），例如 '.html'
	 */
	ext?: string | undefined
	/**
	 * 不含扩展名的文件名（如果有），例如 'index'
	 */
	name?: string | undefined
}

export interface ArsrPath {
	/**
	 * arsr根目录
	 */
	root: string
	/**
	 * arsr资源目录
	 */
	resources: string
	/**
	 * arsr的父目录，包含了arsr以及其他extraResource资源
	 */
	extraResource: string
	/**
	 * 前端web代码根目录
	 */
	renderer: string
}
