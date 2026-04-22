<script lang="ts" setup>
import ScraperPregressWindow from '@renderer/components/scraperView/scraperPregressWindow.vue'
import TabContainer from '@renderer/components/tabContainer.vue'
import ConfirmDialog from 'primevue/confirmdialog'
import DynamicDialog from 'primevue/dynamicdialog'
import Toast from 'primevue/toast'
</script>

<template>
    <TabContainer />
    <Toast position="top-center" />
    <DynamicDialog />
    <ConfirmDialog :closable="false" :draggable="false"> </ConfirmDialog>
    <ScraperPregressWindow />
</template>

<style lang="scss">
.tab-header {
    width: 100%;
    height: var(--header-height);
    border-bottom: var(--separator);
    display: flex;
    align-items: center;
    padding: 0 1.5rem;
    gap: 1rem;

    h3 {
        font-weight: normal;
        margin-right: auto;
    }
}
</style>
