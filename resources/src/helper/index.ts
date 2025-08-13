import { PathHelper } from '@/helper/PathHelper.ts'

/**
 * 初始化，把该创建的目录创建一下
 */
export function initHelper() {
	PathHelper.createDir(PathHelper.logPath)
	PathHelper.createDir(PathHelper.tempPath)
}

export * from '@/helper/PathHelper.ts'
export * from '@/helper/HttpHelper.ts'
export * from '@/helper/DebugHelper.ts'
