<script setup lang="ts">
import Button from 'primevue/button'

interface IProps {
    /** 按钮文本 */
    label?: string
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
        :icon="icon"
        :label="label"
        :rounded="rounded"
        :size="size"
        :style="{ '--hover-background': hoverBackground || 'transparent' }"
        class="text-button"
        severity="secondary"
        text
    />
</template>

<style lang="scss" scoped>
.text-button:hover,
.text-button:active {
    background: var(--hover-background) !important;
    color: var(--p-primary-color) !important;
}
</style>
