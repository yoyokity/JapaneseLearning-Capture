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
const videoTrack = computed(() => props.info?.video()[0] ?? null)

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
    if (bitRate < 1000) return `${bitRate} bps`
    if (bitRate < 1000 * 1000) return `${(bitRate / 1000).toFixed(2)} Kbps`
    if (bitRate < 1000 * 1000 * 1000) return `${(bitRate / 1000 / 1000).toFixed(2)} Mbps`

    return `${(bitRate / 1000 / 1000 / 1000).toFixed(2)} Gbps`
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
    <div>
        <!-- 文件操作 -->
        <div style="display: flex; gap: 0.5rem">
            <Button
                icon="pi pi-play-circle"
                label="播放"
                style="width: 10rem"
                @click="openVideoPath"
            />
            <Button
                icon="pi pi-folder-open"
                label="打开文件夹"
                severity="secondary"
                style="width: 10rem"
                @click="openVideoDir"
            />
        </div>

        <InfoTable
            :info="{
                default: [
                    { 文件名: `${video.fileName}${video.extname}` },
                    { 路径: videoPathText },
                    { 文件大小: formatFileSize(video.size) },
                    { 加入时间: joinTimeText },
                    { 编辑时间: changeTimeText }
                ],
                视频: [
                    { 格式: videoTrack?.Format || '' },
                    {
                        时长: formatDuration(generalTrack?.Duration)
                    },
                    { 码率: formatBitRate(videoTrack?.BitRate) },
                    {
                        宽高: formatResolution(
                            videoTrack?.Width,
                            videoTrack?.Height,
                            videoTrack?.DisplayAspectRatio
                        )
                    },
                    { 帧率: formatFrameRate(videoTrack?.FrameRate, videoTrack?.FrameRate_Mode) },
                    { 位深: formatBitDepth(videoTrack?.BitDepth) },
                    { 流大小: formatStreamSize(videoTrack?.StreamSize) }
                ]
            }"
            style="margin-top: 3rem"
        />
    </div>
</template>

<style lang="scss" scoped></style>
