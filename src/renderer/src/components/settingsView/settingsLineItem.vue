<script lang="ts" setup>
/**
 * 设置项子选项属性
 */
interface IProps {
    /**
     * 标题
     */
    title: string
}

defineProps<IProps>()
</script>

<template>
    <div class="line-item-options-item">
        <h2>{{ title }}</h2>
        <div class="line-item-options-item-right">
            <slot />
        </div>
    </div>
</template>

<style lang="scss" scoped>
.line-item-options-item {
    height: 3rem;
    display: flex;
    align-items: center;
    justify-content: space-between;

    h2 {
        margin: initial;
        font-weight: normal;
        font-size: 1rem;
        height: 1.5rem;
    }

    .line-item-options-item-right {
        display: flex;
        align-items: center;
        gap: 1rem;
    }
}
</style>
