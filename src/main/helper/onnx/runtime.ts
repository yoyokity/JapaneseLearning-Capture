type OnnxRuntime = typeof import('onnxruntime-node')
let runtimePromise: Promise<OnnxRuntime> | undefined

/**
 * 懒加载 onnxruntime-node 运行时（进程内只加载一次）
 * @remark 必须在 onnxruntime-common 首次加载前禁用全局 Float16Array：common 在模块加载时检测到
 *         Float16Array 可用（现代 Node/Electron 均可用）会把 float16 映射为 Float16Array，但 N-API
 *         无法识别 Float16Array（上报为类型 0），被原生层拒绝（上游 issue #26791）。禁用后 common
 *         走官方兜底的 Uint16Array 存储，与原生层的 float16 约定一致。若将来 onnxruntime 原生支持
 *         Float16Array，移除该行即可。
 */
export const loadOnnxRuntime = (): Promise<OnnxRuntime> => {
    runtimePromise ??= (async () => {
        Reflect.deleteProperty(globalThis, 'Float16Array')
        return import('onnxruntime-node')
    })()
    return runtimePromise
}
