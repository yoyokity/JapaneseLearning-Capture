<script lang="ts" setup>
import AudioEncode from '@renderer/components/toolsView/tools/audioEncode.vue'
import ImageSuperResolution from '@renderer/components/toolsView/tools/imageSuperResolution.vue'
import { toolsStore } from '@renderer/components/toolsView/toolsStore'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

/** 工具列表 */
const tools = [
    {
        id: 'audioEncode',
        name: '音频编码',
        component: AudioEncode
    },
    {
        id: 'imageSuperResolution',
        name: '图片超分',
        component: ImageSuperResolution
    }
]

const { activeToolId } = storeToRefs(toolsStore())

const activeTool = computed(() => tools.find((tool) => tool.id === activeToolId.value))

/**
 * 切换工具
 * @param toolId 工具ID
 */
function switchTool(toolId: string) {
    activeToolId.value = toolId
}
</script>

<template>
    <div class="tools-view">
        <div class="tool-list">
            <div
                v-for="tool in tools"
                :key="tool.id"
                :class="{ active: tool.id === activeToolId }"
                class="tool-item"
                @click="switchTool(tool.id)"
            >
                {{ tool.name }}
                <!-- 激活指示条 -->
                <div class="active-indicator" />
            </div>
        </div>
        <div v-if="activeTool" class="tool-content">
            <!-- 切换工具时保留组件状态 -->
            <KeepAlive>
                <component :is="activeTool.component" />
            </KeepAlive>
        </div>
    </div>
</template>

<style lang="scss" scoped>
.tools-view {
    display: flex;
    width: 100%;
    height: 100%;
    overflow: hidden;
}

.tool-list {
    height: 100%;
    width: 10rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-right: var(--separator);
}

.tool-item {
    position: relative;
    width: 100%;
    height: 3.5rem;
    font-weight: 500;
    flex-shrink: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    font-size: 0.875rem;
    border-radius: var(--border-radius);
    transition: all 0.3s var(--animation-type);

    &:hover {
        background-color: var(--p-surface-100);
    }

    &.active {
        background-color: var(--p-surface-200);
        color: var(--p-primary-color);
    }
}

.active-indicator {
    position: absolute;
    left: 0.375rem;
    top: 50%;
    transform: translateY(-50%);
    width: 0.25rem;
    height: 0;
    background-color: var(--p-primary-color);
    border-radius: 0.125rem;
    opacity: 0;
    transition: all 0.3s var(--animation-type);
}

.tool-item.active .active-indicator {
    height: 1.5rem;
    opacity: 1;
}

.tool-content {
    flex: 1;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;

    > * {
        flex: 1;
        min-height: 0;
    }
}
</style>
