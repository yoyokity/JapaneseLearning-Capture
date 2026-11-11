<script lang="ts" setup>
import { useMessage } from '@renderer/components/control/message'
import { PreviewImage } from '@renderer/components/control/previewImage'
import ScraperPregressWindow from '@renderer/components/scraperView/scraperPregressWindow.vue'
import TabContainer from '@renderer/components/tabContainer.vue'
import { LogHelper } from '@renderer/helper'
import { ipc } from '@renderer/ipc'
import { settingsStore, updateStore } from '@renderer/stores'
import ConfirmDialog from 'primevue/confirmdialog'
import DynamicDialog from 'primevue/dynamicdialog'
import Toast from 'primevue/toast'
import { onMounted } from 'vue'

const settings = settingsStore()
const update = updateStore()
const { toast } = useMessage()

onMounted(() => {
    // 上次更新替换失败时提示用户
    void ipc.update.lastError
        .query()
        .then((error) => {
            if (error) toast.error(error)
        })
        .catch((error) => LogHelper.error('读取更新失败标记失败', error))

    if (!settings.update.autoCheck) return

    // 延迟检查，避免启动阶段与模型加载等请求抢占网络
    setTimeout(async () => {
        try {
            const info = await update.check()
            if (info) toast.info(`发现新版本 ${info.version}，可在 设置 → 关于 中更新`)
        } catch (error) {
            LogHelper.error('自动检查更新失败', error)
        }
    }, 3000)
})
</script>

<template>
    <TabContainer />
    <Toast position="top-center" />
    <DynamicDialog />
    <ConfirmDialog :closable="false" :draggable="false"> </ConfirmDialog>
    <ScraperPregressWindow />
    <PreviewImage />
</template>

<style lang="scss">
.tab-header {
    width: 100%;
    height: var(--header-height);
    border-bottom: var(--separator);
    display: flex;
    align-items: center;
    padding: 0 1.5rem;
    gap: 1rem;

    h3 {
        font-weight: normal;
        margin-right: auto;
    }

    .note {
        font-size: 0.75rem;
        color: var(--p-text-muted-color);
        max-width: 15rem;
    }
}
</style>
