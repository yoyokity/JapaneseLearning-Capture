import { Path } from '@renderer/helper/PathHelper'
import { DebugHelper } from '@renderer/helper/DebugHelper'
import { ImageData, Ipc } from '@renderer/ipc'

export class ImageHelper {
	/**
	 * 读取图片
	 * @remarks 用时 <10ms
	 * @param path 图片路径
	 * @returns 图片数据
	 */
	static async readImage(path: Path | string) {
		const re = await DebugHelper.tryExecute(Ipc.image.readImage, path.toString())
		if (!re.hasError) {
			return re.result
		} else {
			DebugHelper.error(`读取图片失败：`, re.error)
			return null
		}
	}

	/**
	 * 保存图片
	 * @remarks 用时 <10ms
	 * @param path 图片路径
	 * @param imageData 图片数据
	 */
	static async saveImage(imageData: ImageData, path: Path | string) {
		const re = await DebugHelper.tryExecute(Ipc.image.saveImage, imageData, path.toString())
		if (!re.hasError) {
			return re.result
		} else {
			DebugHelper.error(`保存图片失败：`, re.error)
		}
	}

	/**
	 * 超分辨率处理图片
	 * @remarks 用时 <10ms
	 * @param imageData 图片数据
	 * @param path 保存路径
	 * @param anime 是否为动漫图片，默认为false
	 */
	static async superResolutionImage(
		imageData: ImageData,
		path: Path | string,
		anime: boolean = false
	) {
		const re = await DebugHelper.tryExecute(
			Ipc.image.superResolutionImage,
			imageData,
			path.toString(),
			anime
		)
		if (!re.hasError) {
			return re.result
		} else {
			DebugHelper.error(`超分辨率处理图片失败：`, re.error)
		}
	}
}
