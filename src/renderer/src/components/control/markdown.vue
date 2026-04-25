<script setup lang="ts">
import { marked } from 'marked'
import { computed } from 'vue'

import 'github-markdown-css/github-markdown.css'

interface IProps {
    content: string
}

const props = defineProps<IProps>()

// 将 markdown 内容渲染为 html
const html = computed(() => marked.parse(props.content) as string)
</script>

<template>
    <div class="markdown-body" v-html="html" />
</template>

<style lang="scss" scoped>
.markdown-body {
    user-select: text;
    color: var(--p-text-color);

    :deep(a) {
        color: var(--p-primary-color);
    }

    :deep(h2) {
        color: var(--p-pink-600);
        margin-top: var(--base-size-40);
    }

    :deep(img) {
        max-width: 80%;
        margin-bottom: 2rem;
        border-radius: var(--border-radius);
        border: var(--separator);
    }
}
</style>
