import { Path } from '@renderer/helper'
import { IScraper, Scraper } from '../scraper/Scraper'
import { IVideo, IVideoFile } from '../scraper/Video'

const hanimeScraper: IScraper = {
	scraperName: '里番',
	checkConnect: async () => {
		return true
	},
	scraperVideo: async (video: IVideo) => {
		return {} as IVideo
	},
	createDirectory: async (scraperPath: Path, video: IVideo, sourceVideoFile: IVideoFile) => {
		return await Scraper.defaultCreateDirectory(
			scraperPath,
			video,
			sourceVideoFile,
			null,
			(video) => {
				return video.set
			}
		)
	},
	downloadImage: async (videoDir: Path, video: IVideo) => {
		await Scraper.defaultDownloadImage(videoDir, video, undefined, true)
	}
}

export default hanimeScraper
