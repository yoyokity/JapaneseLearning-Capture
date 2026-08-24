<script lang="ts" setup></script>

<template>
    <div class="blank-tool">
        <!-- 工具头部 -->
        <div class="tool-head">空白工具</div>
    </div>
</template>

<style lang="scss" scoped>
.blank-tool {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.tool-head {
    height: var(--header-height);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    padding: 0 1.25rem;
    font-size: 1.25rem;
    font-weight: bold;
    border-bottom: var(--separator);
}
</style>
