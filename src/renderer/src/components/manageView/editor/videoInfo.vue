<script setup lang="ts">
import type { MediaInfo } from '@renderer/helper'
import type { IVideoFile } from '@renderer/scraper'

import InfoTable from '@renderer/components/control/infoTable.vue'
import { PathHelper, timeFormat } from '@renderer/helper'
import dayjs from 'dayjs'
import Button from 'primevue/button'
import { computed } from 'vue'

const props = defineProps<{
    video: IVideoFile
    info: MediaInfo | null
}>()

const videoPathText = computed(() => props.video.path?.toString?.() ?? '')
const videoDirText = computed(() => props.video.dir?.toString?.() ?? '')
const joinTimeText = computed(() => props.video.dirJoinTime?.format?.(timeFormat) ?? '')
const changeTimeText = computed(() => props.video.changeTime?.format?.(timeFormat) ?? '')

const generalTrack = computed(() => props.info?.general() ?? null)
const videoTracks = computed(() => props.info?.video() ?? [])
const audioTracks = computed(() => props.info?.audio() ?? [])

type InfoItem = Record<string, string>
type VideoTrack = ReturnType<MediaInfo['video']>[number]
type AudioTrack = ReturnType<MediaInfo['audio']>[number]

/**
 * 创建信息项
 * @param key 键
 * @param value 值
 */
function createInfoItem(key: string, value: string): InfoItem {
    return {
        [key]: value
    }
}

/**
 * 格式化文件大小
 * @param size 文件大小
 */
function formatFileSize(size: number) {
    if (size < 1024) return `${size} B`
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`
    if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(2)} MB`

    return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`
}

/**
 * 格式化时长
 * @param value 秒数
 */
function formatDuration(value: string | number | null | undefined) {
    const second = Math.floor(Number(value))
    if (!Number.isFinite(second) || second < 0) return ''

    const duration = dayjs.duration(second, 'seconds')
    if (duration.hours() === 0) {
        return duration.format('mm 分 ss 秒')
    }

    if (duration.minutes() === 0) {
        return duration.format('ss 秒')
    }

    return duration.format('HH 时 mm 分 ss 秒')
}

/**
 * 格式化码率
 * @param value 码率
 */
function formatBitRate(value: string | number | null | undefined) {
    const bitRate = Number(value)
    if (!Number.isFinite(bitRate) || bitRate <= 0) return ''
    if (bitRate < 10000) return `${bitRate} b/s`
    if (bitRate < 10000 * 1000) return `${(bitRate / 1000).toFixed(0)} Kb/s`
    if (bitRate < 10000 * 1000 * 1000) return `${(bitRate / 1000 / 1000).toFixed(2)} Mb/s`

    return `${(bitRate / 1000 / 1000 / 1000).toFixed(2)} Gb/s`
}

/**
 * 格式化采样率
 * @param value 采样率
 */
function formatSamplingRate(value: string | number | null | undefined) {
    const samplingRate = Number(value)
    if (!Number.isFinite(samplingRate) || samplingRate <= 0) return ''
    if (samplingRate < 1000) return `${samplingRate} Hz`
    if (samplingRate < 1000 * 1000) return `${(samplingRate / 1000).toFixed(2)} KHz`
    if (samplingRate < 1000 * 1000 * 1000) return `${(samplingRate / 1000 / 1000).toFixed(2)} MHz`

    return `${(samplingRate / 1000 / 1000 / 1000).toFixed(2)} GHz`
}

/**
 * 格式化宽高
 * @param width 宽
 * @param height 高
 * @param displayAspectRatio 宽高比
 */
function formatResolution(
    width: string | number | null | undefined,
    height: string | number | null | undefined,
    displayAspectRatio: string | number | null | undefined
) {
    if (!width || !height) return ''

    const resolution = `${width} x ${height}`
    if (!displayAspectRatio) return resolution

    return `${resolution} (${displayAspectRatio})`
}

/**
 * 格式化帧率
 * @param frameRate 帧率
 * @param frameRateMode 帧率模式
 */
function formatFrameRate(
    frameRate: string | number | null | undefined,
    frameRateMode: string | null | undefined
) {
    if (!frameRate) return ''
    if (!frameRateMode) return frameRate.toString()

    return `${frameRate} (${frameRateMode})`
}

/**
 * 格式化位深
 * @param value 位深
 */
function formatBitDepth(value: string | number | null | undefined) {
    if (!value) return ''

    return `${value} bit`
}

/**
 * 格式化声道
 * @param channels 声道数
 * @param channelLayout 声道格式
 */
function formatChannels(
    channels: string | number | null | undefined,
    channelLayout: string | null | undefined
) {
    const channelText = String(channels ?? '').trim()
    const layoutText = channelLayout?.trim() ?? ''

    if (!channelText && !layoutText) return ''
    if (!layoutText) return channelText
    if (!channelText) return layoutText

    return `${channelText} (${layoutText})`
}

/**
 * 格式化压缩模式
 * @param value 压缩模式
 */
function formatCompressionMode(value: string | null | undefined) {
    if (!value) return ''
    if (value.toLowerCase().includes('lossless')) return '无损'

    return '有损'
}

/**
 * 生成轨道分组名称
 * @param baseName 基础名称
 * @param index 索引
 * @param total 总数
 */
function createTrackGroupName(baseName: string, index: number, total: number) {
    return total > 1 ? `${baseName} ${index + 1}` : baseName
}

/**
 * 生成轨道信息分组
 * @param baseName 基础分组名
 * @param tracks 轨道列表
 * @param createItem 单轨信息
 */
function createTrackGroups<T>(
    baseName: string,
    tracks: T[],
    createItem: (track: T | undefined) => InfoItem
) {
    if (tracks.length <= 1) {
        return {
            [baseName]: [createItem(tracks[0])]
        }
    }

    return Object.fromEntries(
        tracks.map((track, index) => [
            createTrackGroupName(baseName, index, tracks.length),
            [createItem(track)]
        ])
    ) as Record<string, InfoItem[]>
}

/**
 * 创建视频轨道信息
 * @param track 视频轨道
 */
function createVideoTrackInfo(track: VideoTrack | undefined): InfoItem {
    return {
        格式: track?.Format || '',
        宽高: formatResolution(track?.Width, track?.Height, track?.DisplayAspectRatio),
        码率: formatBitRate(track?.BitRate),
        帧率: formatFrameRate(track?.FrameRate, track?.FrameRate_Mode),
        帧数: track?.FrameCount || '',
        色彩空间: track?.ColorSpace || '',
        色度抽样: track?.ChromaSubsampling || '',
        位深: formatBitDepth(track?.BitDepth),
        时长: formatDuration(track?.Duration),
        流大小: formatStreamSize(track?.StreamSize)
    }
}

/**
 * 创建音频轨道信息
 * @param track 音频轨道
 */
function createAudioTrackInfo(track: AudioTrack | undefined): InfoItem {
    return {
        格式: track?.Format || '',
        时长: formatDuration(track?.Duration),
        码率: formatBitRate(track?.BitRate),
        声道: formatChannels(track?.Channels, track?.ChannelLayout),
        采样率: formatSamplingRate(track?.SamplingRate),
        帧率: formatFrameRate(track?.FrameRate, ''),
        帧数: track?.FrameCount || '',
        压缩模式: formatCompressionMode(track?.Compression_Mode),
        语言: track?.Language || '',
        流大小: formatStreamSize(track?.StreamSize)
    }
}

const infoData = computed<Record<string, InfoItem[]>>(() => ({
    default: [
        createInfoItem('文件名', `${props.video.fileName}${props.video.extname}`),
        createInfoItem('路径', videoPathText.value),
        createInfoItem('加入时间', joinTimeText.value),
        createInfoItem('编辑时间', changeTimeText.value),
        createInfoItem('文件大小', formatFileSize(props.video.size)),
        createInfoItem('总帧数', generalTrack.value?.FrameCount || ''),
        createInfoItem('总码率', formatBitRate(generalTrack.value?.OverallBitRate)),
        createInfoItem('时长', formatDuration(generalTrack.value?.Duration))
    ],
    ...createTrackGroups('视频', videoTracks.value, createVideoTrackInfo),
    ...createTrackGroups('音频', audioTracks.value, createAudioTrackInfo),
    其他: [
        createInfoItem(
            '附件',
            generalTrack.value?.extra?.Attachments.split('/')
                .map((x) => x.trim())
                .join('\n') || ''
        )
    ]
}))

/**
 * 格式化流大小
 * @param value 流大小
 */
function formatStreamSize(value: string | number | null | undefined) {
    const size = Number(value)
    if (!Number.isFinite(size) || size <= 0) return ''

    return formatFileSize(size)
}

/**
 * 播放视频
 */
function openVideoPath() {
    if (!videoPathText.value) return

    PathHelper.openInExplorer(videoPathText.value)
}

/**
 * 打开视频所在目录
 */
function openVideoDir() {
    if (!videoDirText.value) return

    PathHelper.openInExplorer(videoDirText.value)
}
</script>

<template>
    <InfoTable :info="infoData" style="margin-bottom: 4rem" />

    <!-- 文件操作 -->
    <div class="button-container">
        <Button icon="pi pi-play-circle" label="播放" style="width: 10rem" @click="openVideoPath" />
        <Button
            icon="pi pi-folder-open"
            label="打开文件夹"
            severity="secondary"
            style="width: 10rem"
            @click="openVideoDir"
        />
    </div>
</template>

<style lang="scss" scoped>
.button-container {
    position: fixed;
    bottom: var(--header-height);
    width: 100%;
    background-color: var(--p-surface-0);
    padding: 1rem 0;

    display: flex;
    gap: 0.5rem;
}

:deep(.info-row) {
    --p-tag-font-size: calc(1rem - 2px);

    font-size: var(--p-tag-font-size);

    .info-value {
        line-height: 2;
    }
}
</style>
