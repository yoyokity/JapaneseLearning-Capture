/**
 * invoke的包装函数，返回invoke结果
 * @param channel invoke通道名
 * @param args 传入参数
 * @description 如果后端运行时报错，则会抛出后端异常到前端
 */
export async function invoke( channel: string, ...args: any[]) {
	const re = await window.electron.ipcRenderer.invoke(channel, ...args)
	if (!re.hasError) {
		return re.result
	}else {
		throw re.error
	}
}