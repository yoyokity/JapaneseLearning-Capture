import { filesystem } from '@renderer/ipc/filesystem.ts'
import { app } from '@renderer/ipc/app.ts'

export class Ipc {
	static app = app
	static filesystem = filesystem

	/**
	 * 测试IPC连通
	 */
	static async check(): Promise<boolean> {
		return (await window.electron.ipcRenderer.invoke('check')) || false
	}
}
