import { app, ipcMain } from 'electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { tryExecuteSync } from './func'

export const appPath = {
	root: '',
	arsr: '',
	resources: '',
	extraResource: '',
	renderer: ''
}

// 返回app的工作路径
ipcMain.handle('filesystem:appPath', () => {
	return tryExecuteSync(() => appPath.root)
})

// 返回app的arsr路径
ipcMain.handle('filesystem:arsrPath', () => {
	return tryExecuteSync(() => {
		return {
			root: appPath.arsr,
			resources: appPath.resources,
			extraResource: appPath.extraResource,
			renderer: appPath.renderer
		}
	})
})

// 返回userData路径
ipcMain.handle('filesystem:userPath', () => app.getPath('userData'))

// 返回logs路径
ipcMain.handle('filesystem:logsPath', () => app.getPath('logs'))

// 返回temp路径
ipcMain.handle('filesystem:tempPath', () => app.getPath('temp'))

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

// 判断路径是否为绝对路径
ipcMain.handle('filesystem:isAbsolute', (_, filePath: string) => {
	return tryExecuteSync(path.isAbsolute, filePath)
})

// 获取从一个路径到另一个路径的相对路径
ipcMain.handle('filesystem:relative', (_, from: string, to: string) => {
	return tryExecuteSync(path.relative, from, to)
})
