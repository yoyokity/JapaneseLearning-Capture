import { ipcMain, shell } from 'electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { tryExecute, tryExecuteSync } from './func'
import fg from 'fast-glob'
import pkg from 'fs-extra'
import log from 'electron-log'

const { ensureDirSync, removeSync, copySync, moveSync, outputFileSync } = pkg

// 判断path是否存在于磁盘上
ipcMain.handle('filesystem:isExist', (_, path: string) => {
	return tryExecuteSync(fs.existsSync, path)
})

// 判断path是否为文件
ipcMain.handle('filesystem:isFile', (_, path: string) => {
	return tryExecuteSync(() => fs.statSync(path).isFile())
})

// 判断path是否为目录
ipcMain.handle('filesystem:isDirectory', (_, path: string) => {
	return tryExecuteSync(() => fs.statSync(path).isDirectory())
})

// 获取path状态信息
ipcMain.handle('filesystem:getStatus', (_, path: string) => {
	return tryExecuteSync(fs.statSync, path)
})

// 路径拼接
ipcMain.handle('filesystem:join', (_, ...pathSegments: string[]) => {
	return tryExecuteSync(path.join, ...pathSegments)
})

// 路径拼接
ipcMain.handle('filesystem:resolve', (_, ...pathSegments: string[]) => {
	return tryExecuteSync(path.resolve, ...pathSegments)
})

// 获取文件扩展名
ipcMain.handle('filesystem:extname', (_, filePath: string) => {
	return tryExecuteSync(path.extname, filePath)
})

// 获取路径中的文件名
ipcMain.handle('filesystem:basename', (_, filePath: string, ext?: string) => {
	return tryExecuteSync(path.basename, filePath, ext)
})

// 获取路径中的目录名
ipcMain.handle('filesystem:dirname', (_, filePath: string) => {
	return tryExecuteSync(path.dirname, filePath)
})

// 从对象中格式化路径
ipcMain.handle('filesystem:format', (_, pathObject: path.FormatInputPathObject) => {
	return tryExecuteSync(path.format, pathObject)
})

// 获取从一个路径到另一个路径的相对路径
ipcMain.handle('filesystem:relative', (_, from: string, to: string) => {
	return tryExecuteSync(path.relative, from, to)
})

// 递归创建目录，如果目录已存在则跳过
ipcMain.handle('filesystem:createDirectory', (_, dirPath: string) => {
	return tryExecuteSync(() => {
		if (fs.existsSync(dirPath)) {
			return true
		}

		ensureDirSync(dirPath)
		return fs.existsSync(dirPath)
	})
})

// 使用fast-glob搜索文件和目录
ipcMain.handle(
	'filesystem:readDirectory',
	async (
		_,
		patterns: string | string[],
		options: {
			cwd?: string
			ignore?: string[]
			onlyFiles?: boolean
			onlyDirectories?: boolean
			deep?: number
		}
	) => {
		return await tryExecute(async () => {
			const searchOptions = {
				...options,
				absolute: true,
				dot: true,
				stats: false
			}

			// 如果没有明确指定只要文件或只要目录，则默认获取两者
			if (options.onlyFiles === undefined && options.onlyDirectories === undefined) {
				searchOptions.onlyFiles = false
			}

			return await fg.glob(patterns, searchOptions)
		})
	}
)

// 删除文件或目录
ipcMain.handle('filesystem:remove', (_, targetPath: string) => {
	return tryExecuteSync(() => {
		if (!fs.existsSync(targetPath)) {
			return true // 目标已经不存在，视为删除成功
		}

		removeSync(targetPath)

		// 返回目标是否已不存在（删除成功）
		return !fs.existsSync(targetPath)
	})
})

// 复制文件或目录
ipcMain.handle(
	'filesystem:copy',
	(
		_,
		sourcePath: string,
		destPath: string,
		overwrite: boolean = true,
		filter?: (src: string, dest: string) => boolean
	) => {
		return tryExecuteSync(() => {
			const options = {
				overwrite,
				filter
			}
			copySync(sourcePath, destPath, options)
			return true
		})
	}
)

// 移动文件或目录
ipcMain.handle(
	'filesystem:move',
	(_, sourcePath: string, destPath: string, overwrite: boolean = true) => {
		return tryExecuteSync(() => {
			moveSync(sourcePath, destPath, { overwrite })
			return true
		})
	}
)

// 写入文件（如果目录不存在则创建）
ipcMain.handle(
	'filesystem:writeFile',
	(_, filePath: string, data: string | NodeJS.ArrayBufferView) => {
		return tryExecuteSync(() => {
			outputFileSync(filePath, data)
			return true
		})
	}
)

// 追加内容到文件（如果文件不存在则创建）
ipcMain.handle('filesystem:appendFile', (_, filePath: string, data: string | Uint8Array) => {
	return tryExecuteSync(() => {
		fs.appendFileSync(filePath, data)
		return true
	})
})

// 读取文件内容
ipcMain.handle(
	'filesystem:readFile',
	(_, filePath: string, encoding: BufferEncoding | 'buffer') => {
		return tryExecuteSync(() => {
			if (encoding === 'buffer') {
				// 如果 encoding 为 null，返回 Buffer
				return fs.readFileSync(filePath)
			} else {
				// 否则使用指定的编码（默认为 'utf-8'）
				return fs.readFileSync(filePath, encoding)
			}
		})
	}
)

// 写入log文件
ipcMain.on(
	'filesystem:writeLog',
	(_, type: 'log' | 'error' | 'warn' | 'info', ...params: any[]) => {
		try {
			log[type](...params)
		} catch (e) {
			console.warn(`log写入失败: [${type}] ${params.join(' ')}`, e)
		}
	}
)

// 读取图片
ipcMain.handle('filesystem:readImage', (_, path: string) => {
	return tryExecuteSync(() => {
		const data = fs.readFileSync(path)
		// 将图片数据转换成 Base64 字符串
		const base64String = data.toString('base64')

		// 根据文件扩展名判断 MIME 类型
		const ext = path.toLowerCase().split('.').pop() || ''
		let mimeType = 'image/jpeg' // 默认类型

		// 常见图片格式的 MIME 类型映射
		const mimeTypes: Record<string, string> = {
			jpg: 'image/jpeg',
			jpeg: 'image/jpeg',
			png: 'image/png',
			gif: 'image/gif',
			webp: 'image/webp',
			svg: 'image/svg+xml',
			bmp: 'image/bmp',
			ico: 'image/x-icon',
			tif: 'image/tiff',
			tiff: 'image/tiff'
		}

		if (ext in mimeTypes) {
			mimeType = mimeTypes[ext]
		}

		return `data:${mimeType};base64,${base64String}`
	})
})

// 在资源管理器中打开路径
ipcMain.handle('filesystem:openInExplorer', (_, path: string) => {
	return tryExecute(async () => {
		await shell.openPath(path)
		return true
	})
})
