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

function switchTab(tabId: string) {
    if (tabId === activeTab.value) return
    activeTab.value = tabId
}

// 获取当前活动组件
const currentComponent = () => {
    const tab = tabs.find((tab) => tab.id === activeTab.value)
    return tab ? tab.component : null
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
                <div class="tab-content-wrapper">
                    <i :class="tab.icon" />
                    <span class="tab-name">{{ tab.name }}</span>
                </div>
                <transition name="indicator">
                    <div v-if="activeTab === tab.id" class="active-indicator" />
                </transition>
            </div>
        </div>
        <div class="content">
            <transition name="slide-up">
                <keep-alive exclude="settingsView">
                    <component :is="currentComponent()" :key="activeTab" class="tab-content" />
                </keep-alive>
            </transition>
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
    width: 6rem;
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
}

.tab-content {
    height: 100%;
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
    width: 2rem;
    height: 0.25rem;
    background-color: var(--p-primary-color);
    border-radius: 0.125rem;
}

/* 指示器进入和离开动画 */
.indicator-enter-active,
.indicator-leave-active {
    transition: all 0.3s var(--animation-type);
}

.indicator-enter-from {
    width: 0.5rem;
    opacity: 0;
}

.indicator-leave-to {
    width: 0.5rem;
    opacity: 0;
}

/* Tab内容滑动动画 */
.slide-up-enter-active,
.slide-down-enter-active {
    transition: transform 0.2s var(--animation-type);
}

.slide-up-leave-active,
.slide-down-leave-active {
    transition: none;
    display: none;
}

.slide-up-enter-from {
    transform: translateY(20px);
}

.slide-up-leave-to {
    transform: translateY(0);
}

.slide-down-enter-from {
    transform: translateY(-20px);
}

.slide-down-leave-to {
    transform: translateY(0);
}
</style>
