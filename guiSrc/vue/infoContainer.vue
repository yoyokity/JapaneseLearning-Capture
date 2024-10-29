<script setup>
import { onMounted, ref } from 'vue'

const containerRef = ref(null)
</script>

<template>
    <div class="info-container">
        <div class="info-container-left">
            <el-anchor :container="containerRef">
                <el-anchor-link href="#info-概述" title="概述"></el-anchor-link>
                <el-anchor-link href="#info-使用方法" title="使用方法"></el-anchor-link>
                <el-anchor-link href="#info-JavDB" title="JavDB"></el-anchor-link>
                <el-anchor-link href="#info-getchu" title="getchu"></el-anchor-link>
            </el-anchor>
            <div class="info-container-dividing"></div>
        </div>
        <div class="info-container-right" ref="containerRef">
            <div id="info-概述" class="section">
                <h1>概述</h1>
                <p>Japanese Learning Capture用于刮削视频信息，管理本地视频文件夹</p>
                <h6>（本工具不提供任何视频下载功能）</h6>
                <br>
                <br>
                <p>主页：<a target="_blank" href="https://github.com/yoyokity/JapaneseLearning-Capture">https://github.com/yoyokity/JapaneseLearning-Capture</a>
                </p>
                <p>反馈：<a target="_blank" href="https://github.com/yoyokity/JapaneseLearning-Capture/issues">https://github.com/yoyokity/JapaneseLearning-Capture/issues</a>
                </p>
                <p>下载：<a target="_blank" href="https://github.com/yoyokity/JapaneseLearning-Capture/releases">https://github.com/yoyokity/JapaneseLearning-Capture/releases</a>
                </p>
            </div>
            <div id="info-使用方法" class="section">
                <h1>使用方法</h1>
                <p>1、设置好输出目录，每个刮削器单独设置</p>
                <p>2、设置好网络代理以及翻译api</p>
                <p>3、拖入或选择需要刮削的文件</p>
                <p>4、选择好对应刮削器</p>
                <p>5、点击刮削</p>
            </div>
            <div id="info-JavDB" class="section">
                <h1>JavDB刮削器</h1>
                <h6>请不要使用日本地区代理，网站会登不上去</h6>
            </div>
            <div id="info-getchu" class="section">
                <h1>Getchu刮削器</h1>
                <p>主要用于动画番剧相关的信息刮削。</p>
                <h6>由于getchu的搜索功能比较拉胯，不够精确。</h6>
                <h6>为了确保刮削内容的准确性，请将番号编辑为getchu的作品id！ 在对应页面的网址中就能找到。（
                    ?id=后面那串数字。）</h6>
            </div>
            <div class="section" style="height: 200px"></div>
        </div>
    </div>
</template>
<style scoped>
.info-container {
    --font-size: 15px;
    width: 100%;
    display: flex;
}

.info-container-left {
    height: 100%;
    width: 25%;
    max-width: 500px;
    padding-top: 5em;
    display: flex;
    flex-direction: row-reverse;
    justify-content: center;
    position: relative;

    :deep(.el-anchor__link) {
        font-size: var(--font-size) !important;
    }

    .info-container-dividing {
        height: 60%;
        width: 2px;
        position: absolute;
        right: 3em;
        opacity: .1;
        border-radius: 10px;
        top: 3em;
        background-color: var(--color-accent);
    }
}

.info-container-right {
    height: 100%;
    width: 200px;
    overflow-y: auto;
    overflow-x: hidden;
    margin-right: 2px;
    flex: 1;
}

.section {
    padding: 40px 20px;
    font-size: var(--font-size) !important;
    color: var(--color-text-secondary);
    padding-right: 6em;
    margin-bottom: 50px;
    user-select: text;

    h1 {
        color: var(--color-text-primary);
        font-weight: bold;
        font-size: 25px;
        margin-bottom: 1em;
    }

    p, h6 {
        line-height: 2.5em;
    }

    h6 {
        color: var(--color-accent-hover);
    }
}

/* 整个滚动条的宽度 */
::-webkit-scrollbar {
    width: 6px; /* 垂直滚动条宽度 */
    height: 6px; /* 水平滚动条高度 */
}

/* 滚动条的轨道 */
::-webkit-scrollbar-track {
    background: transparent; /* 轨道背景色 */
    border-radius: 10px; /* 圆角 */
}

/* 滚动条的滑块 */
::-webkit-scrollbar-thumb {
    margin: 0 2px;
    background: rgb(202, 202, 202); /* 滑块背景色 */
    border-radius: 10px; /* 圆角 */
}

/* 滚动条滑块在悬停时的样式 */
::-webkit-scrollbar-thumb:hover {
    background: rgb(173, 172, 172); /* 悬停时的背景色 */
}
</style>