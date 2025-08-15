/**
 * invoke的包装函数，返回invoke结果
 * @param channel invoke通道名
 * @param args 传入参数
 * @description 如果后端运行时报错，则会抛出后端异常到前端
 */
export async function invoke(channel: string, ...args: any[]) {
	const re = await window.electron.ipcRenderer.invoke(channel, ...args)
	if (!re.hasError) {
		return re.result
	} else {
		throw re.error
	}
}

/**
 * send的包装函数，用于向主进程发送单向消息
 * @param channel 消息通道名
 * @param args 传入参数
 * @description 该函数不会等待主进程响应，适用于不需要返回值的场景
 */
export function send(channel: string, ...args: any[]) {
	window.electron.ipcRenderer.send(channel, ...args)
}
