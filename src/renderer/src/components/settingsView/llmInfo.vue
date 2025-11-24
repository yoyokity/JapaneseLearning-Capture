<script lang="ts" setup>
import llmInfo1 from '@renderer/assets/llm-info-1.jpg'
import llmInfo2 from '@renderer/assets/llm-info-2.jpg'
import llmInfo3 from '@renderer/assets/llm-info-3.jpg'
import llmInfo4 from '@renderer/assets/llm-info-4.jpg'
import Button from 'primevue/button'
import Image from 'primevue/image'
import Message from 'primevue/message'
import ScrollPanel from 'primevue/scrollpanel'
</script>

<template>
    <div class="llm-info" style="user-select: text">
        <ScrollPanel style="height: calc(90vh - 7rem)">
            <div class="content">
                <h1>本地LLM API服务器推荐对新手最友好的：</h1>
                <Message severity="info"> LM Studio </Message>
                <h1>
                    模型推荐：（以下模型均只能 日翻简中，不过刮削器也不会刮英文，所以没影响哦~）
                </h1>
                <Message severity="info"> Sakura-7B-Qwen2.5 </Message>
                <p class="info-text">这个模型推荐下q6k规格的，效果最好。</p>
                <Message severity="info"> sakura-galtransl-7b </Message>
                <p class="info-text">
                    这个模型推荐下q5ks规格的，效果略逊于上面的一丢丢，但是速度极快。
                </p>
                <h1 style="margin-top: 2rem">安装步骤：</h1>
                <ol>
                    <li>
                        <Button
                            as="a"
                            href="https://lmstudio.ai/download"
                            style="padding: 0; font-size: 1rem !important"
                            target="_blank"
                            variant="link"
                        >
                            下载并安装 LM Studio
                        </Button>
                    </li>
                    <li>
                        跳过新手指导后，在左下角选择 Power User 模式。<br /><Image
                            :src="llmInfo1"
                            width="400"
                        />
                    </li>
                    <li>
                        点击左侧"搜索"，输入模型名称并下载。同时可以在右侧界面中选择规格。
                        <br />
                        <Image :src="llmInfo2" width="400" />
                        <br />
                        <Image :src="llmInfo4" width="400" />
                    </li>
                    <li>
                        点击左侧"开发者"，启用。（如果启动失败就换个端口试试）<br /><Image
                            :src="llmInfo3"
                            width="400"
                        />
                    </li>
                </ol>
            </div>
        </ScrollPanel>
    </div>
</template>

<style lang="scss" scoped>
h1 {
    font-size: 1rem;
}

ol {
    li {
        line-height: 3;
    }
}

.info-text {
    color: var(--p-text-muted-color);
}
</style>
