import { filesystem } from '@renderer/ipc/filesystem.ts'

export class Ipc {
	static filesystem = filesystem

	/**
	 * 测试IPC连通
	 */
	static async check(): Promise<boolean> {
		return (await window.electron.ipcRenderer.invoke('check')) || false
	}
}
