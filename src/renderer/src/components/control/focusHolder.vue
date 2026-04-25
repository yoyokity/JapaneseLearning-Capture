<!-- 用于初始焦点占位，避免弹窗打开时默认聚焦关闭按钮 -->
<script setup lang="ts"></script>

<template>
    <div autofocus class="focus-holder" tabindex="-1"></div>
</template>

<style lang="scss" scoped>
.focus-holder {
    position: absolute;
    width: 0;
    height: 0;
    overflow: hidden;
    opacity: 0;
    pointer-events: none;
}
</style>
