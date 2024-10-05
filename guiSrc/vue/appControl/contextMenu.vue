<script setup>
import { ContextMenu } from '@/js/globalState/globalState.js'

const contextMenu = ContextMenu()

function click (func) {
    contextMenu.closeMenu()
    func()
}
</script>

<template>
    <div id="context-menu" tabindex="0"
         v-show="contextMenu.getShow"
         @blur="contextMenu.closeMenu"
         :style="`transform: translateX(${contextMenu.pos_x}px) translateY(${contextMenu.pos_y}px)`">
        <div class="context-menu-item" v-for="[key,value] in Object.entries(contextMenu.contextConfig)"
             @click="click(value)">{{ key }}
        </div>
    </div>
</template>

<style scoped>

#context-menu {
    position: absolute;
    top: 0;
    left: 0;
    min-width: 10em;
    min-height: 2em;
    z-index: 99999;
    box-sizing: border-box;
    outline: 0;

    background: var(--el-bg-color-overlay);
    border: 1px solid var(--el-border-color-light);
    box-shadow: var(--el-box-shadow-light);
    border-radius: 5px;
    overflow: hidden;
}

.context-menu-item {
    padding: 3px 15px;
    height: 2em;
    line-height: 2em;
    font-size: 13px;
    color: var(--color-text-secondary);
    transition: color .1s, background-color .1s;

    &:hover {
        background-color: var(--el-color-primary-light-9);
        color: var(--color-text-primary);
    }
}
</style>