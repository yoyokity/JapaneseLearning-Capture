import type { MenuItem } from 'primevue/menuitem'
import type { IFileItem } from './type'

import { ref } from 'vue'

/**
 * 右键菜单Hook
 */
export function useFileContextMenu() {
    const fileItemContextMenu = ref()
    const currentContextMenuItem = ref<IFileItem | null>(null)

    /**
     * 判断文件项是否支持右键菜单
     * @param item 文件项
     */
    function getFileItemCanContextmenu(item: IFileItem) {
        return item.scraperState === 'warn' || item.scraperState === 'success'
    }

    /**
     * 编辑刮削数据
     * @param item 文件项
     */
    function handleEditScraperData(item: IFileItem) {
        const video: IVideoFile = {}
    }

    /**
     * 文件项右键菜单项
     */
    const fileItemContextMenuItems = ref<MenuItem[]>([
        {
            label: '编辑刮削数据',
            command: () => {
                if (!currentContextMenuItem.value) return

                handleEditScraperData(currentContextMenuItem.value)
            }
        }
    ])

    /**
     * 打开文件项右键菜单
     * @param event 鼠标事件
     * @param item 当前文件项
     */
    function showFileItemContextMenu(event: MouseEvent, item: IFileItem) {
        if (!getFileItemCanContextmenu(item)) return

        event.preventDefault()
        event.stopPropagation()

        currentContextMenuItem.value = item
        fileItemContextMenu.value?.show?.(event)
    }

    return {
        fileItemContextMenu,
        fileItemContextMenuItems,
        showFileItemContextMenu
    }
}
