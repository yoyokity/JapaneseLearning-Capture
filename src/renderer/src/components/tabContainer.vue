<script lang="ts" setup>
import AiLogView from '@renderer/components/aiLogView/aiLogView.vue'
import { closeGlobalStickyWarn, showGlobalStickyWarn } from '@renderer/components/control/message'
import ManageView from '@renderer/components/manageView/manageView.vue'
import ScraperView from '@renderer/components/scraperView/scraperView.vue'
import SettingsView from '@renderer/components/settingsView/settingsView.vue'
import { toolsStore } from '@renderer/components/toolsView/toolsStore'
import ToolsView from '@renderer/components/toolsView/toolsView.vue'
import { dependencyStore, settingsStore } from '@renderer/stores'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'

/** 标签页 */
const tabs = [
    { id: 'scraper', name: '刮削', icon: 'pi pi-search', component: ScraperView },
    { id: 'manage', name: '管理', icon: 'pi pi-folder', component: ManageView },
    { id: 'tools', name: '工具', icon: 'pi pi-wrench', component: ToolsView },
    { id: 'aiLog', name: '日志', icon: 'pi pi-history', component: AiLogView },
    { id: 'settings', name: '设置', icon: 'pi pi-cog', component: SettingsView }
]

/** 锁定时可访问页 */
const accessibleWhenLocked = new Set(['aiLog', 'settings'])

const { pendingRequestCount } = storeToRefs(toolsStore())
const dependency = dependencyStore()
const settings = settingsStore()

const activeTab = ref('scraper')

/** 缺失配置 */
const missingConfigs = computed(() => {
    const list: string[] = []
    if (dependency.missingRequired) list.push('依赖')
    if (!settings.aiReady) list.push('AI')
    if (!settings.searchReady) list.push('联网搜索')
    return list
})

/** 是否锁定 */
const locked = computed(() => missingConfigs.value.length > 0)

/** 切换标签页 */
function switchTab(tabId: string) {
    if (tabId === activeTab.value) return
    // 锁定时仅日志与设置可进
    if (locked.value && !accessibleWhenLocked.has(tabId)) return
    activeTab.value = tabId
}

// 缺失配置常驻提示
watch(
    () => missingConfigs.value.join('、'),
    (value) => {
        if (value) showGlobalStickyWarn(`请先设置必要配置：${value}`)
        else closeGlobalStickyWarn()
    },
    { immediate: true }
)

// 工具请求切换
watch(pendingRequestCount, () => switchTab('tools'))

// 锁定时留在可访问页
watch(locked, (value) => {
    if (value && !accessibleWhenLocked.has(activeTab.value)) activeTab.value = 'settings'
})

// 启动检查依赖
void dependency.checkLocal()
</script>

<template>
    <div class="tab-container">
        <div class="tab">
            <div
                v-for="tab in tabs"
                :key="tab.id"
                :class="{
                    active: activeTab === tab.id,
                    disabled: locked && !accessibleWhenLocked.has(tab.id)
                }"
                :style="{ marginTop: tab.id === 'aiLog' ? 'auto' : undefined }"
                class="tab-item"
                @click="switchTab(tab.id)"
            >
                <!-- 标签按钮 -->
                <div class="tab-content-wrapper">
                    <i :class="tab.icon" />
                    <span class="tab-name">{{ tab.name }}</span>
                </div>
                <!-- 激活指示器 -->
                <div class="active-indicator" />
            </div>
        </div>
        <div class="content">
            <!-- 内容区域 -->
            <component
                :is="tab.component"
                v-for="tab in tabs"
                :key="tab.id"
                class="tab-content"
                :class="{
                    active: activeTab === tab.id,
                    'slide-up': activeTab === tab.id
                }"
                :active="
                    tab.id === 'aiLog' || tab.id === 'settings' ? activeTab === tab.id : undefined
                "
            />
        </div>
    </div>
</template>

<style lang="scss" scoped>
.tab-container {
    display: flex;
    width: inherit;
    height: inherit;
    flex: 1;
    overflow: hidden;
}

.tab {
    width: var(--main-tab-width);
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: 0.5rem;
    border-right: var(--separator);
}

.tab-item {
    width: 5rem;
    height: 5rem;
    display: flex;
    justify-content: center;
    align-items: center;
    margin-bottom: 0.5rem;
    cursor: pointer;
    border-radius: var(--border-radius);
    transition: all 0.3s var(--animation-type);
    position: relative;
    font-weight: 500;

    &.active {
        background-color: var(--p-surface-200);
        color: var(--p-primary-color);
    }

    &.disabled {
        opacity: 0.35;
        cursor: not-allowed;
        pointer-events: none;
    }

    i {
        font-size: 1.2rem;
    }
}

.tab-content-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
}

.tab-name {
    font-size: 0.75rem;
    margin-top: 0.5rem;
    text-align: center;
}

.content {
    flex: 1;
    height: auto;
    overflow: hidden;
    position: relative;
}

.tab-content {
    height: 100%;
    width: 100%;
    position: absolute;
    inset: 0;
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transform: translateY(0);

    &.active {
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
        z-index: 1;
    }

    &.slide-up {
        animation: slide-up-enter 0.2s var(--animation-type);
    }
}

.active-indicator {
    position: absolute;
    bottom: 5px;
    left: 50%;
    transform: translateX(-50%);
    width: 0.5rem;
    height: 0.25rem;
    background-color: var(--p-primary-color);
    border-radius: 0.125rem;
    opacity: 0;
    transition: all 0.3s var(--animation-type);
}

.tab-item.active .active-indicator {
    width: 2rem;
    opacity: 1;
}

@keyframes slide-up-enter {
    from {
        transform: translateY(20px);
    }

    to {
        transform: translateY(0);
    }
}
</style>
