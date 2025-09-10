import { Path } from '@renderer/helper'
import { IVideo } from '@renderer/scraper'

export interface IVideoFile extends IVideo {
	/**
	 * 视频文件的完整路径
	 */
	path: Path
	/**
	 * 视频文件所在目录路径
	 */
	dir: Path
	/**
	 * 视频文件的文件名
	 */
	fileName: string
	/**
	 * 视频文件的扩展名
	 */
	extname: string
	/**
	 * 视频文件的NFO文件路径
	 */
	nfoPath: Path
	/**
	 * 视频文件的封面
	 */
	poster: Path | null
	/**
	 * 视频文件的缩略图
	 */
	thumb: Path | null
	/**
	 * 视频文件的背景图
	 */
	fanart: Path | null
}
