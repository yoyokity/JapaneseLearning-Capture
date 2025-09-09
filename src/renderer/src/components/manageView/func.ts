import { PathHelper, videoExtensions } from '@renderer/helper'
import { IVideoFile } from './type'
import { Nfo } from '@renderer/scraper'
import { globalStatesStore, settingsStore } from '@renderer/stores'

/**
 * 扫描目录下的文件
 * @remarks 忽略extrafanart目录下的文件
 */
export async function scanFiles(path: string): Promise<IVideoFile[]> {
	const globalStates = globalStatesStore()
	const settings = settingsStore()

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

	//排序
	videoFiles.sort((a, b) => {
		if (settings.manageViewSort === 'title') {
			return a.sorttitle.localeCompare(b.sorttitle, undefined, { sensitivity: 'base' })
		} else if (settings.manageViewSort === 'releasedate') {
			return a.releasedate.localeCompare(b.releasedate, undefined, { sensitivity: 'base' })
		}
		return 0
	})

	globalStates.manageViewLoading = false
	return videoFiles
}
