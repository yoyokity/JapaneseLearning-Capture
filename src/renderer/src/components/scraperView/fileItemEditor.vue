<script lang="ts" setup>
import { Scraper } from '@renderer/scraper'
import Button from 'primevue/button'
import FloatLabel from 'primevue/floatlabel'
import InputText from 'primevue/inputtext'
import { computed, inject, ref } from 'vue'

interface IFileItemEditorData {
    scraperName: string
    title: string
    num: Record<string, string>
}

const dialogRef = inject('dialogRef') as any
const dialogData = dialogRef.value.data as IFileItemEditorData

const title = ref(dialogData.title)
const num = ref<Record<string, string>>({ ...(dialogData.num || {}) })
const numKeys = computed(() => {
    return Object.keys(Scraper.getScraperInstance(dialogData.scraperName)?.numSource || {})
})

/**
 * 关闭弹窗
 * @param data 返回数据
 */
function closeDialog(data?: IFileItemEditorData) {
    dialogRef.value.close(data)
}

/**
 * 保存修改
 */
function handleSave() {
    const nextNum = numKeys.value.reduce<Record<string, string>>((result, key) => {
        const value = num.value[key]?.trim()
        if (!value) return result

        result[key] = value
        return result
    }, {})

    closeDialog({
        scraperName: dialogData.scraperName,
        title: title.value.trim(),
        num: nextNum
    })
}
</script>

<template>
    <div class="file-item-editor">
        <div class="header">
            <h1>信息编辑</h1>
        </div>

        <div class="file-item-editor-content content">
            <FloatLabel variant="on">
                <InputText id="file_item_title" v-model.trim="title" />
                <label for="file_item_title">标题</label>
            </FloatLabel>

            <h2
                v-tooltip.top="
                    '作品在刮削网站的编号。\n获取作品页面时，有编号就直接进入该页面，否则会先用标题进行搜索。'
                "
            >
                编号
            </h2>
            <FloatLabel v-for="value in numKeys" :key="value" variant="on" style="display: flex">
                <InputText :id="`file_item_num_${value}`" v-model.trim="num[value]" />
                <label :for="`file_item_num_${value}`">{{ value }}</label>
            </FloatLabel>
        </div>

        <div class="footer">
            <Button
                icon="pi pi-times"
                label="取消"
                severity="secondary"
                size="small"
                @click="closeDialog()"
            />
            <Button icon="pi pi-save" label="保存" size="small" @click="handleSave" />
        </div>
    </div>
</template>

<style lang="scss" scoped>
.file-item-editor {
    width: min(36rem, 90vw);

    .file-item-editor-content {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    h2 {
        font-size: 1.2rem;
        font-weight: bold;
        margin: initial;
        margin-top: var(--spacing);
        padding-left: 0.5rem;
        color: var(--p-primary-color);
        margin-right: auto;
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .section-title-icon {
        font-size: 1rem;
        color: var(--p-text-muted-color);
    }

    :deep(input) {
        width: 100%;
    }
}
</style>
