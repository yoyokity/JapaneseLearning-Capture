<script setup lang="ts">
import Button from 'primevue/button'

interface IProps {
    /** 按钮文本 */
    label?: string
    /** 是否禁用 */
    disabled?: boolean
    /** hover、active时的背景色 */
    hoverBackground?: string
    /** 图标类名 */
    icon?: string
    /** 按钮尺寸 */
    size?: 'small' | 'large'
    /**
     * 是否显示圆角
     * @default true
     */
    rounded?: boolean
}

withDefaults(defineProps<IProps>(), {
    rounded: true
})
</script>

<template>
    <Button
        :disabled="disabled"
        :icon="icon"
        :label="label"
        :rounded="rounded"
        :size="size"
        :style="{
            '--hover-background': hoverBackground || 'transparent'
        }"
        class="text-button"
        :class="{
            'text-button-disabled': disabled
        }"
        severity="secondary"
        text
    />
</template>

<style lang="scss" scoped>
.text-button-disabled {
    pointer-events: none !important;
    color: var(--p-surface-400) !important;
}

.text-button:hover,
.text-button:active {
    background: var(--hover-background) !important;
    color: var(--p-primary-color) !important;
}
</style>
