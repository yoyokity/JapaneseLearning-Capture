import type { WithRequired } from '@renderer/helper'
import type { MenuItem } from 'primevue/menuitem'
import type { IFileItem } from './type'

import Editor from '@renderer/components/manageView/editor/editor.vue'
import { globalStatesStore } from '@renderer/stores'
import { useDialog } from 'primevue/usedialog'
import { ref } from 'vue'

/**
 * 右键菜单Hook
 */
export function useFileContextMenu() {
    const globalStates = globalStatesStore()
    const dialog = useDialog()
    const fileItemContextMenu = ref()
    const currentContextMenuItem = ref<IFileItem | null>(null)

    /**
     * 判断文件项是否包含可编辑的视频信息
     */
    function hasVideoFile(item: IFileItem): item is WithRequired<IFileItem, 'videoFile'> {
        return item.videoFile !== undefined
    }

    /**
     * 编辑刮削数据
     * @param item 文件项
     */
    function handleEditScraperData(item: WithRequired<IFileItem, 'videoFile'>) {
        dialog.open(Editor, {
            props: {
                modal: true,
                draggable: false,
                showHeader: false,
                style: {
                    width: 'fit-content',
                    maxWidth: '90vw'
                },
                contentStyle: {
                    overflow: 'initial'
                }
            },
            data: {
                video: item.videoFile
            },
            onClose: (options) => {
                const data = options?.data
                if (!data) return

                item.videoFile = data
            }
        })
    }

    /**
     * 文件项右键菜单项
     */
    const fileItemContextMenuItems = ref<MenuItem[]>([
        {
            label: '编辑刮削数据',
            command: () => {
                if (!currentContextMenuItem.value) return
                if (!hasVideoFile(currentContextMenuItem.value)) return

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
        // 判断有右键菜单时的条件
        if (!hasVideoFile(item)) return
        if (globalStates.batchRunning) return

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
