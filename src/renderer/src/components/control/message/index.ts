import type { ToastMessageOptions } from 'primevue/toast'

import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'

/**
 * 消息类弹窗
 */
export function useMessage() {
    const confirm = useConfirm()
    const _toast = useToast()
    /** 常驻提示消息 */
    let stickyMessage: ToastMessageOptions | null = null

    /**
     * 确认对话框
     */
    const confirmDialog = {
        /**
         * 打开确认对话框，包含确认和取消按钮
         * @param message - 对话框内容消息
         * @param callback - 用户点击确认按钮时的回调函数
         */
        yesOrNo(message: string, callback: () => void) {
            confirm.require({
                message,
                rejectLabel: '取消',
                acceptLabel: '确定',
                rejectProps: {
                    size: 'small',
                    variant: 'text'
                },
                acceptProps: {
                    size: 'small'
                },
                accept: () => {
                    callback()
                }
            })
        },

        /**
         * 打开确认对话框，只包含确认按钮
         * @param message - 对话框内容消息
         * @param callback - 用户点击确认按钮时的回调函数
         */
        yes(message: string, callback?: () => void) {
            confirm.require({
                message,
                rejectProps: {
                    style: {
                        display: 'none'
                    }
                },
                acceptLabel: '确定',
                acceptProps: {
                    size: 'small'
                },
                accept: () => {
                    callback?.()
                }
            })
        }
    }

    /**
     * 通知提示
     */
    const toast = {
        success(message: string) {
            _toast.add({
                severity: 'success',
                summary: message,
                life: 5000
            })
        },
        error(message: string) {
            _toast.add({
                severity: 'error',
                summary: message,
                life: 5000
            })
        },
        info(message: string) {
            _toast.add({
                severity: 'info',
                summary: message,
                life: 5000
            })
        },
        warn(message: string) {
            _toast.add({
                severity: 'warn',
                summary: message,
                life: 5000
            })
        },
        /**
         * 常驻警告提示，重复调用只更新内容
         * @param message 消息
         */
        stickyWarn(message: string) {
            if (stickyMessage?.summary === message) return
            if (stickyMessage) _toast.remove(stickyMessage)

            stickyMessage = { severity: 'warn', summary: message, life: 0 }
            _toast.add(stickyMessage)
        },
        /** 关闭常驻警告提示 */
        closeSticky() {
            if (!stickyMessage) return

            _toast.remove(stickyMessage)
            stickyMessage = null
        }
    }

    return { confirmDialog, toast }
}

/**
 * 全局通知实例
 */
type ToastApi = ReturnType<typeof useMessage>['toast']

let globalToast: ToastApi | null = null

/**
 * 注册全局通知实例
 * @param toast 通知实例
 */
export function setGlobalToast(toast: ToastApi) {
    globalToast = toast
}

/**
 * 全局警告提示
 * @param message 消息
 */
export function showGlobalWarn(message: string) {
    globalToast?.warn(message)
}

/**
 * 全局常驻警告提示，直到手动关闭
 * @param message 消息
 */
export function showGlobalStickyWarn(message: string) {
    globalToast?.stickyWarn(message)
}

/**
 * 关闭全局常驻警告提示
 */
export function closeGlobalStickyWarn() {
    globalToast?.closeSticky()
}
