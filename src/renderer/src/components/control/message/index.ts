import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'

/**
 * 消息类弹窗
 */
export function useMessage() {
    const confirm = useConfirm()
    const _toast = useToast()

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
        }
    }

    return { confirmDialog, toast }
}
