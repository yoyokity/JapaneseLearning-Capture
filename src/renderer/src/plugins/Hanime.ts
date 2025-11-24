import type { Path } from '@renderer/helper'
import type { IScraper } from '../scraper/Scraper'
import type { IVideo, IVideoFile } from '../scraper/Video'

import { Scraper } from '../scraper/Scraper'

const hanimeScraper: IScraper = {
    scraperName: '里番',
    checkConnect: async () => {
        return true
    },
    scraperVideo: async (_video: IVideo) => {
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
