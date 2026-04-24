import type { Path } from '@renderer/helper'
import type { Ref } from 'vue'
import type { IFileItem } from './type'

import { PathHelper, videoExtensions } from '@renderer/helper'
import { settingsStore } from '@renderer/stores'
import { ref } from 'vue'

/**
 * 文件添加删除Hook
 */
export function useFileAppendRemove(
    fileList: Ref<IFileItem[]>,
    fileInputRef: Ref<HTMLInputElement | null>
) {
    const settings = settingsStore()
    const isDragging = ref(false)

    /**
     * 判断文件是否为支持的视频格式
     * @param filePath 文件路径
     */
    function isVideoFile(filePath: Path) {
        const ext = filePath.extname.toLowerCase()
        return Object.keys(videoExtensions).includes(ext)
    }

    /**
     * 获取文件类型图标背景色
     * @param filePath 文件路径
     */
    function getFileExtColor(filePath: Path) {
        const ext = filePath.extname.toLowerCase()
        return videoExtensions[ext] || 'var(--p-text-muted-color)'
    }

    /**
     * 处理拖拽进入和悬停状态
     */
    function handleDragEnter() {
        isDragging.value = true
    }

    /**
     * 处理拖拽离开状态
     * @param e 拖拽事件
     */
    function handleDragLeave(e: DragEvent) {
        if (!(e.currentTarget instanceof HTMLElement)) return
        if (e.currentTarget.contains(e.relatedTarget as Node)) return

        isDragging.value = false
    }

    /**
     * 添加文件到列表
     * @param files 文件列表
     */
    async function appendFiles(files: File[]) {
        if (!files.length) return

        const nextFiles: IFileItem[] = []

        for (const file of files) {
            const filePath = await PathHelper.getPathForFile(file)
            if (!filePath) continue

            const path = PathHelper.newPath(filePath)
            if (!isVideoFile(path)) continue

            nextFiles.push({
                file: path,
                title: path.basename,
                num: {},
                checked: true,
                extColor: getFileExtColor(path),
                scraper: settings.currentScraper,
                progress: 0,
                scraperState: null
            })
        }

        if (!nextFiles.length) return

        const fileMap = new Map(fileList.value.map((item) => [item.file.toString(), item]))
        for (const item of nextFiles) {
            fileMap.set(item.file.toString(), item)
        }

        fileList.value = Array.from(fileMap.values())
    }

    /**
     * 打开文件选择窗口
     */
    function openFileSelect() {
        fileInputRef.value?.click()
    }

    /**
     * 处理文件选择
     * @param e 选择事件
     */
    async function handleFileSelect(e: Event) {
        const input = e.target as HTMLInputElement
        const files = Array.from(input.files || [])

        await appendFiles(files)

        input.value = ''
    }

    /**
     * 处理文件拖入
     * @param e 拖放事件
     */
    async function handleDrop(e: DragEvent) {
        e.preventDefault()
        isDragging.value = false

        const files = Array.from(e.dataTransfer?.files || [])

        await appendFiles(files)
    }

    /**
     * 删除文件项
     * @param path 文件路径
     */
    function removeFile(path: Path) {
        fileList.value = fileList.value.filter((item) => item.file.toString() !== path.toString())
    }

    /**
     * 清空文件列表
     */
    function clearFiles() {
        fileList.value = []
    }

    return {
        isDragging,
        openFileSelect,
        handleFileSelect,
        handleDrop,
        handleDragEnter,
        handleDragLeave,
        removeFile,
        clearFiles
    }
}
