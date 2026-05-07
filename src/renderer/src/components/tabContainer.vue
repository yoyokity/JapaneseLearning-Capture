<script lang="ts" setup>
import ManageView from '@renderer/components/manageView/manageView.vue'
import ScraperView from '@renderer/components/scraperView/scraperView.vue'
import SettingsView from '@renderer/components/settingsView/settingsView.vue'
import { ref } from 'vue'

const tabs = [
    { id: 'scraper', name: '刮削', icon: 'pi pi-search', component: ScraperView },
    { id: 'manage', name: '管理', icon: 'pi pi-folder', component: ManageView },
    { id: 'settings', name: '设置', icon: 'pi pi-cog', component: SettingsView }
]
const activeTab = ref('scraper')

/**
 * 切换标签页
 * @param tabId 标签ID
 */
function switchTab(tabId: string) {
    if (tabId === activeTab.value) return
    activeTab.value = tabId
}
</script>

<template>
    <div class="tab-container">
        <div class="tab">
            <div
                v-for="tab in tabs"
                :key="tab.id"
                :class="{ active: activeTab === tab.id }"
                :style="{ marginTop: tab.id === 'settings' ? 'auto' : undefined }"
                class="tab-item"
                @click="switchTab(tab.id)"
            >
                <!-- Tab按钮内容 -->
                <div class="tab-content-wrapper">
                    <i :class="tab.icon" />
                    <span class="tab-name">{{ tab.name }}</span>
                </div>
                <!-- 激活指示器 -->
                <div class="active-indicator" />
            </div>
        </div>
        <div class="content">
            <!-- Tab内容区域 -->
            <component
                :is="tab.component"
                v-for="tab in tabs"
                :key="tab.id"
                class="tab-content"
                :class="{
                    active: activeTab === tab.id,
                    'slide-up': activeTab === tab.id
                }"
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

    &.active {
        background-color: var(--p-surface-200);
        color: var(--p-primary-color);
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

.padding {
    padding: 2rem;
    height: 100%;
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

h2 {
    margin-top: 0;
    margin-bottom: 1rem;
    font-size: 1.5rem;
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
