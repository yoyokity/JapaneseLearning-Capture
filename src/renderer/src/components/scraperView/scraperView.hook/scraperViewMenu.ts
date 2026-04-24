import type { MenuItem } from 'primevue/menuitem'
import type { IFileItem } from './type'

import FileItemEditor from '@renderer/components/scraperView/fileItemEditor.vue'
import { Scraper } from '@renderer/scraper'
import { computed, ref } from 'vue'

import { fileItemStateColorMap } from './type'

type DialogMethods = ReturnType<typeof import('primevue/usedialog').useDialog>

/**
 * 其余菜单Hook
 */
export function useScraperViewMenu(dialog: DialogMethods) {
    const scraperOptions = Scraper.instances.map((scraper) => scraper.scraperName)
    const scraperMenu = ref()
    const currentMenuItem = ref<IFileItem | null>(null)

    /**
     * 刮削器菜单项
     */
    const scraperMenuItems = computed<MenuItem[]>(() =>
        scraperOptions.map((scraperName) => ({
            label: scraperName,
            command: () => {
                if (currentMenuItem.value) {
                    currentMenuItem.value.scraper = scraperName
                }
            }
        }))
    )

    /**
     * 打开刮削器选择菜单
     * @param event 鼠标事件
     * @param item 当前文件项
     */
    function showScraperMenu(event: MouseEvent, item: IFileItem) {
        currentMenuItem.value = item
        scraperMenu.value?.toggle?.(event)
    }

    /**
     * 打开文件信息编辑窗口
     * @param item 文件项
     */
    function showFileEditor(item: IFileItem) {
        dialog.open(FileItemEditor, {
            props: {
                modal: true,
                draggable: false,
                showHeader: false,
                style: {
                    width: 'fit-content',
                    maxWidth: '90vw'
                },
                header: '信息编辑'
            },
            data: {
                scraperName: item.scraper,
                title: item.title,
                num: { ...item.num }
            },
            onClose: (options) => {
                const data = options?.data
                if (!data) return

                item.title = data.title || item.file.basename
                item.num = data.num || {}
            }
        })
    }

    /**
     * 获取编号展示文本
     * @param item 文件项
     */
    function getNumText(item: IFileItem) {
        return Object.entries(item.num)
            .map(([key, value]) => `${key}:${value}`)
            .join(',  ')
    }

    /**
     * 获取进度条颜色
     * @param item 文件项
     */
    function getFileProgressColor(item: IFileItem) {
        return item.scraperState ? fileItemStateColorMap[item.scraperState] : item.extColor
    }

    /**
     * 获取文件提示文本
     * @param item 文件项
     */
    function getFileTooltipText(item: IFileItem) {
        if (item.scraperState === null || item.scraperState === 'success') {
            return undefined
        }

        return `${item.scraperState === 'error' ? '失败' : '提示'}：\n ${item.scraperStateText}`
    }

    return {
        scraperOptions,
        scraperMenu,
        scraperMenuItems,
        showScraperMenu,
        showFileEditor,
        getNumText,
        getFileProgressColor,
        getFileTooltipText
    }
}
