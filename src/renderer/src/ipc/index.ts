import { filesystem } from '@renderer/ipc/filesystem.ts'
import { app } from '@renderer/ipc/app.ts'
import { net } from '@renderer/ipc/net.ts'
import { image } from '@renderer/ipc/image.ts'

export type { ImageData } from '@renderer/ipc/image.ts'

export class Ipc {
	static app = app
	static filesystem = filesystem
	static net = net
	static image = image

	/**
	 * 测试IPC连通
	 */
	static async check(): Promise<boolean> {
		return (await window.electron.ipcRenderer.invoke('check')) || false
	}
}
