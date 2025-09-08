import { PathHelper, videoExtensions } from '@renderer/helper'
import { IVideoFile } from './type'
import { Nfo } from '@renderer/scraper'
import { globalStatesStore } from '@renderer/stores/globalStates'

/**
 * 扫描目录下的文件
 * @remarks 忽略extrafanart目录下的文件
 */
export async function scanFiles(path: string): Promise<IVideoFile[]> {
	const globalStates = globalStatesStore()
	globalStates.manageViewLoading = true

	const videoFiles: IVideoFile[] = []
	const files = await PathHelper.readDirectory(path, 'file', undefined, ['**/extrafanart/**'])

	// 过滤出视频文件
	for (const file of files.filter((file) => {
		const ext = PathHelper.newPath(file).extname.toLowerCase()
		return videoExtensions.includes(ext)
	})) {
		videoFiles.push(await Nfo.read(file, files))
	}

	globalStates.manageViewLoading = false
	return videoFiles
}
