import { IScraper } from '../scraper/Scraper'
import { IVideo } from '../scraper/Video'

const hanimeScraper: IScraper = {
	scraperName: '里番',
	checkConnect: async () => {
		return true
	},
	scraperVideo: async () => {
		return {} as IVideo
	},
	createDirectory: async () => {
		return true
	},
	downloadImage: async () => {
		return true
	}
}

export default hanimeScraper
