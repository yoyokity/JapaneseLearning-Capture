<script lang="ts" setup>
import FocusHolder from '@renderer/components/control/focusHolder.vue'
import Markdown from '@renderer/components/control/markdown.vue'
import Scroll from '@renderer/components/control/scroll/scroll.vue'

import llmInfoMarkdown from './llmInfo.md?raw'
</script>

<template>
    <div>
        <FocusHolder />
        <Scroll style="height: calc(90vh - 7rem)">
            <Markdown class="content" :content="llmInfoMarkdown" />
        </Scroll>
    </div>
</template>

<style lang="scss" scoped>
.content {
    padding: 0 1rem 0 2rem !important;
}
</style>
