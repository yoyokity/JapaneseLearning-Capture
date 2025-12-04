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

<style scoped></style>
