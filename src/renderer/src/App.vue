<script lang="ts" setup>
import TabContainer from '@renderer/components/tabContainer.vue'
import ConfirmDialog from 'primevue/confirmdialog'
import DynamicDialog from 'primevue/dynamicdialog'
import Toast from 'primevue/toast'
</script>

<template>
    <TabContainer />
    <Toast />
    <DynamicDialog />
    <ConfirmDialog :closable="false" :draggable="false"> </ConfirmDialog>
</template>

<style lang="scss">
.header {
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
