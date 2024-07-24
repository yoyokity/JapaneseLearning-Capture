<script setup>
const props = defineProps({
    label: {
        type: String,
        default: ''
    },
    tooltip: {
        type: String,
        default: ''
    }
})
</script>

<template>
    <div class="card">
        <div class="card-header">{{ props.label }}</div>
        <div class="card-body">
            <slot></slot>
        </div>
        <div class="card-footer" v-if="props.tooltip">{{ props.tooltip }}</div>
    </div>
</template>

<style scoped>
.card {
    --margin-left: 1.5em;

    width: calc(100% - 6em);
    max-width: 800px;
    margin-top: 3em;

    & .card-header {
        padding-left: var(--margin-left);
        font-weight: bold;
        color: var(--color-text-secondary);
    }

    & .card-body {
        margin: .7em 0;
        padding: 1em var(--margin-left);
        border-radius: 10px;
        background-color: var(--color-secondary-light);
        color: var(--color-text-primary);
    }

    & .card-footer {
        color: var(--color-text-secondary-light);
        padding: 0 var(--margin-left);
        font-size: 12px;
    }
}
</style>