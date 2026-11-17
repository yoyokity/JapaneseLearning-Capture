import { readdirSync } from 'node:fs'
import { join } from 'node:path'

/** HuggingFace 官方地址 */
export const HUGGINGFACE_ENDPOINT = 'https://huggingface.co'
/** HuggingFace 镜像，官方不可达时回退 */
export const HF_MIRROR = 'https://hf-mirror.com'

/**
 * 字幕依赖的源文件
 */
export interface ISubtitleSource {
    /** 所属组件，也是 tools 目录名 */
    component: 'subtitle'
    /** 官方下载地址 */
    url: string
    /** 文件大小 */
    size: number
    /** 文件 sha256 */
    sha256: string
    /** 安装后的相对路径；压缩包表示解压目标目录 */
    target: string
    /** 是否为压缩包 */
    archive?: boolean
}

/**
 * 字幕依赖源文件清单
 * @remark 固定 revision 与校验值，避免上游更新后构建产物与运行时下载不一致
 */
export const SUBTITLE_SOURCES: ISubtitleSource[] = [
    {
        component: 'subtitle',
        url: 'https://github.com/CrispStrobe/CrispASR/releases/download/v0.8.53/crispasr-windows-x86_64-cuda.zip',
        size: 787_539_468,
        sha256: 'd1ec290f2c077706aa5fde7337fcedc618744622b035b9dc7a2be7cae7bc4293',
        target: 'runtimes/windows-x64/cuda/bin',
        archive: true
    },
    {
        component: 'subtitle',
        url: 'https://huggingface.co/cstr/qwen3-forced-aligner-0.6b-GGUF/resolve/1ec5110602ccab18c878ddebedab0891e290a95c/qwen3-forced-aligner-0.6b-q4_k.gguf',
        size: 529_001_216,
        sha256: 'a7bb4cbeacc6414f11a5d23dc7661a51a941a71e6d559dc7b408b52473f2ae84',
        target: 'models/qwen3-forced-aligner.gguf'
    },
    {
        component: 'subtitle',
        url: 'https://huggingface.co/cstr/whisper-vad-encdec-asmr-GGUF/resolve/f7f32c7d5d1730830c7bb3b6521a185561e82357/whisper-vad-asmr-q4_k.gguf',
        size: 25_418_080,
        sha256: 'b5b984de4e390158f33f307104635423409c2638ab07977caf836b05671c455d',
        target: 'models/vad/whisper-vad-asmr-q4_k.gguf'
    },
    {
        component: 'subtitle',
        url: 'https://huggingface.co/cstr/cohere-transcribe-03-2026-GGUF/resolve/4e98a8c31c95a92d651e60e3bfae4fe29fc6e026/cohere-transcribe-q4_k.gguf',
        size: 1_289_178_240,
        sha256: '116f4c4f7ff1b03997100d3a097e13fecd84350555b9979867b241cd6803e4f5',
        target: 'models/cohere-transcribe-q4_k.gguf'
    }
]

/**
 * 获取组件的源文件总大小
 * @param component 组件 id
 */
export function getSourceSize(component: string) {
    return SUBTITLE_SOURCES.filter((source) => source.component === component).reduce(
        (sum, source) => sum + source.size,
        0
    )
}

/**
 * 获取下载地址，HF 源追加镜像候选
 * @param url 官方地址
 * @param preferMirror 是否优先使用镜像
 */
export function getSourceUrls(url: string, preferMirror = false) {
    if (!url.startsWith(HUGGINGFACE_ENDPOINT)) return [url]

    const mirrorUrl = url.replace(HUGGINGFACE_ENDPOINT, HF_MIRROR)
    return preferMirror ? [mirrorUrl, url] : [url, mirrorUrl]
}

/**
 * 递归查找文件
 * @param dir 目录
 * @param name 文件名
 */
export function findFile(dir: string, name: string): string | null {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = join(dir, entry.name)
        if (entry.isDirectory()) {
            const found = findFile(fullPath, name)
            if (found) return found
        } else if (entry.name === name) {
            return fullPath
        }
    }

    return null
}
