<script lang="ts" setup>
import InfoTable from '@renderer/components/control/infoTable.vue'
import InputLine from '@renderer/components/control/inputLine/inputLine.vue'
import InputLineItem from '@renderer/components/control/inputLine/inputLineItem.vue'
import Scroll from '@renderer/components/control/scroll/scroll.vue'
import LlmInfo from '@renderer/components/settingsView/llmInfo.vue'
import { DeepseekReasoningEffortArray, LogHelper, PathHelper, TransHelper } from '@renderer/helper'
import { Scraper } from '@renderer/scraper'
import { settingsStore } from '@renderer/stores'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Select from 'primevue/select'
import ToggleSwitch from 'primevue/toggleswitch'
import { useDialog } from 'primevue/usedialog'
import { useToast } from 'primevue/usetoast'
import { ref } from 'vue'

const appName = __APP_NAME__
    .replace(/-/g, ' ') // 把短横线变成空格
    .replace(/\b\w/g, (char) => char.toUpperCase()) // 每个单词首字母大写
const appVersion = __APP_VERSION__

const settings = settingsStore()
const translateEngineConfigRef = ref()
const llmModels = ref<string[]>([])
const testDefaultText = 'こんにちは世界'
const testText = ref(testDefaultText)
const testTranslateLoading = ref(false)
const toast = useToast()
const dialog = useDialog()

const tabs = [
    { id: 'settings', name: '设置', icon: 'pi pi-cog' },
    { id: 'info', name: '关于', icon: 'pi pi-info-circle' }
]
const activeTab = ref('settings')

function switchTab(tabId: string) {
    if (tabId === activeTab.value) return
    activeTab.value = tabId
}

// 获取LLM模型列表
async function fetchLLMModels() {
    if (settings.translate.translateEngine !== 'localLLM') return
    llmModels.value = await TransHelper.getLLMModels()
}

async function testTranslate() {
    if (testTranslateLoading.value) return

    testTranslateLoading.value = true

    try {
        let reasoningText = ''

        const result = await TransHelper.translate(testText.value, true, (_, reasoningData) => {
            reasoningText += reasoningData
        })

        if (result.ok) {
            if (reasoningText) LogHelper.title('app').title('AI Thinking').debug(reasoningText)
            LogHelper.debug('翻译成功：', result.text)
            toast.add({
                severity: 'success',
                summary: '翻译成功',
                detail: result.text,
                life: 3000
            })
        } else {
            LogHelper.debug('翻译失败：', result.text)
            toast.add({
                severity: 'error',
                summary: '翻译失败',
                detail: '翻译服务异常',
                life: 3000
            })
        }
    } finally {
        testTranslateLoading.value = false
    }
}

function openLlmInfo() {
    dialog.open(LlmInfo, {
        props: {
            modal: true,
            draggable: false,
            header: '本地LLM大模型使用说明',
            style: {
                width: 'fit-content',
                maxWidth: '60rem'
            },
            contentStyle: {
                padding: '0'
            }
        },
        onClose: () => {
            fetchLLMModels()
        }
    })
}

function openAppPath() {
    PathHelper.openInExplorer(PathHelper.appPath)
}

function openLogsFile() {
    PathHelper.openInExplorer(PathHelper.logsPath.join('main.log'))
}

function openTempPath() {
    PathHelper.openInExplorer(PathHelper.tempPath)
}
</script>

<template>
    <div class="settings-view">
        <div class="tab">
            <div
                v-for="tab in tabs"
                :key="tab.id"
                :class="{ active: activeTab === tab.id }"
                class="tab-item"
                @click="switchTab(tab.id)"
            >
                <div class="tab-content-wrapper">
                    <i :class="tab.icon" style="font-size: 0.9rem" />
                    <span class="tab-name">{{ tab.name }}</span>
                </div>
            </div>
            <div
                :style="{
                    transform: `translateX(${tabs.findIndex((tab) => tab.id === activeTab) * 5}rem)`
                }"
                class="active-indicator"
            />
        </div>
        <Scroll class="content">
            <transition name="slide-up">
                <div v-if="activeTab === 'settings'" key="settings" class="settings-tab-content">
                    <h1 style="margin-top: 0">输出目录</h1>

                    <InputLine
                        v-for="scraper in Scraper.instances"
                        :key="scraper.scraperName"
                        :title="scraper.scraperName"
                    >
                        <template #right>
                            <InputText
                                v-model.trim="settings.scraperPath[scraper.scraperName]"
                                type="text"
                            />
                        </template>
                    </InputLine>

                    <p class="settings-view-description">
                        为每个刮削器设置的单独的输出路径。如果使用相对路径，则在app根目录下创建对应文件夹
                    </p>

                    <h1>网络</h1>

                    <InputLine icon="pi pi-hourglass" title="连接超时（秒）">
                        <template #right>
                            <InputNumber
                                v-model.trim="settings.net.timeout"
                                :max="30"
                                :min="0"
                                show-buttons
                            />
                        </template>
                    </InputLine>

                    <InputLine
                        description="连接失败后，重连的次数"
                        icon="pi pi-sync"
                        title="重连次数"
                    >
                        <template #right>
                            <InputNumber
                                v-model.trim="settings.net.retry"
                                :max="10"
                                :min="0"
                                show-buttons
                            />
                        </template>
                    </InputLine>

                    <InputLine
                        description="同一个网站中，每次请求之间的时间间隔不小于此值，以免触发反爬"
                        icon="pi pi-clock"
                        title="最小请求间隔时间（毫秒）"
                    >
                        <template #right>
                            <InputNumber
                                v-model.trim="settings.net.delay"
                                :max="10000"
                                :min="0"
                                :step="1000"
                                :use-grouping="false"
                                show-buttons
                            />
                        </template>
                    </InputLine>

                    <InputLine :collapsible="true" icon="pi pi-globe" title="网络代理">
                        <InputLineItem title="启用">
                            <ToggleSwitch v-model="settings.proxy.enable" />
                        </InputLineItem>
                        <InputLineItem title="主机">
                            <InputText v-model.trim="settings.proxy.host" type="text" />
                        </InputLineItem>
                        <InputLineItem title="端口">
                            <InputNumber
                                v-model.trim="settings.proxy.port"
                                :max="65535"
                                :min="1"
                                :use-grouping="false"
                            />
                        </InputLineItem>
                    </InputLine>

                    <h1>翻译</h1>

                    <InputLine icon="pi pi-language" title="启用">
                        <template #right>
                            <ToggleSwitch v-model="settings.translate.enable" />
                        </template>
                    </InputLine>

                    <InputLine
                        description="当一次AI翻译失败后，会自动调用谷歌翻译，再次翻译这段内容"
                        icon="pi pi-sync"
                        title="AI翻译失败后用谷歌翻译"
                    >
                        <template #right>
                            <ToggleSwitch v-model="settings.translate.retryWithGoogle" />
                        </template>
                    </InputLine>

                    <InputLine icon="pi pi-microchip" title="翻译引擎">
                        <template #right>
                            <Select
                                v-model="settings.translate.translateEngine"
                                :options="TransHelper.translateEngines"
                                @change="
                                    () => {
                                        translateEngineConfigRef.close()
                                    }
                                "
                            />
                        </template>
                    </InputLine>

                    <InputLine
                        ref="translateEngineConfigRef"
                        :collapsible="true"
                        :description="
                            TransHelper.getTranslateEngineDescription(
                                settings.translate.translateEngine
                            )
                        "
                        :disable="settings.translate.translateEngine === 'google'"
                        :title="`${settings.translate.translateEngine}配置`"
                        @open="fetchLLMModels"
                    >
                        <!-- #region openai配置  -->
                        <div v-if="settings.translate.translateEngine === 'openai'">
                            <InputLineItem title="API Key">
                                <Button
                                    as="a"
                                    href="https://platform.openai.com/api-keys"
                                    target="_blank"
                                    variant="link"
                                >
                                    获取API Key
                                </Button>
                                <InputText
                                    v-model.trim="settings.translate.openai.apiKey"
                                    type="text"
                                />
                            </InputLineItem>
                            <InputLineItem title="Base URL">
                                <InputText
                                    v-model.trim="settings.translate.openai.baseURL"
                                    type="text"
                                />
                            </InputLineItem>
                            <InputLineItem title="模型">
                                <Button
                                    as="a"
                                    href="https://platform.openai.com/docs/models"
                                    target="_blank"
                                    variant="link"
                                >
                                    查看全部模型
                                </Button>
                                <InputText
                                    v-model.trim="settings.translate.openai.model"
                                    type="text"
                                />
                            </InputLineItem>
                        </div>
                        <!-- #endregion openai配置 -->

                        <!-- #region deepseek配置  -->
                        <div v-if="settings.translate.translateEngine === 'deepseek'">
                            <InputLineItem title="API Key">
                                <Button
                                    as="a"
                                    href="https://platform.deepseek.com/api_keys"
                                    target="_blank"
                                    variant="link"
                                >
                                    获取API Key
                                </Button>
                                <InputText
                                    v-model.trim="settings.translate.deepseek.apiKey"
                                    type="text"
                                />
                            </InputLineItem>
                            <InputLineItem title="模型">
                                <Button
                                    as="a"
                                    href="https://api-docs.deepseek.com/zh-cn/quick_start/pricing"
                                    target="_blank"
                                    variant="link"
                                >
                                    查看全部模型
                                </Button>
                                <InputText
                                    v-model.trim="settings.translate.deepseek.model"
                                    type="text"
                                />
                            </InputLineItem>
                            <InputLineItem title="思考模式">
                                <ToggleSwitch v-model="settings.translate.deepseek.thinking" />
                            </InputLineItem>
                            <InputLineItem title="思考强度">
                                <Select
                                    v-model="settings.translate.deepseek.reasoningEffort"
                                    :options="DeepseekReasoningEffortArray as any"
                                />
                            </InputLineItem>
                        </div>
                        <!-- #endregion deepseek配置 -->

                        <!-- #region gemini配置  -->
                        <div v-if="settings.translate.translateEngine === 'gemini'">
                            <InputLineItem title="API Key">
                                <Button
                                    as="a"
                                    href="https://aistudio.google.com/app/apikey"
                                    target="_blank"
                                    variant="link"
                                >
                                    获取API Key
                                </Button>
                                <InputText
                                    v-model.trim="settings.translate.gemini.apiKey"
                                    type="text"
                                />
                            </InputLineItem>
                            <InputLineItem title="模型">
                                <Button
                                    v-tooltip.top="
                                        '不建议更换，默认的这个模型，免费、量大管饱、速度还快'
                                    "
                                    as="a"
                                    href="https://ai.google.dev/gemini-api/docs/models"
                                    target="_blank"
                                    variant="link"
                                >
                                    查看全部模型
                                </Button>
                                <InputText
                                    v-model.trim="settings.translate.gemini.model"
                                    type="text"
                                />
                            </InputLineItem>
                        </div>
                        <!-- #endregion gemini配置 -->

                        <!-- #region LLM配置  -->
                        <div v-if="settings.translate.translateEngine === 'localLLM'">
                            <InputLineItem title="主机">
                                <InputText
                                    v-model.trim="settings.translate.localLLM.host"
                                    type="text"
                                    @change="fetchLLMModels"
                                />
                            </InputLineItem>
                            <InputLineItem title="端口">
                                <InputNumber
                                    v-model.trim="settings.translate.localLLM.port"
                                    :max="65535"
                                    :min="1"
                                    :use-grouping="false"
                                    @change="fetchLLMModels"
                                />
                            </InputLineItem>
                            <InputLineItem title="模型">
                                <Message
                                    v-if="
                                        settings.translate.translateEngine === 'localLLM' &&
                                        llmModels.length === 0
                                    "
                                    severity="error"
                                >
                                    请先启动本地LLM服务！
                                </Message>
                                <Select
                                    v-model="settings.translate.localLLM.model"
                                    :options="llmModels"
                                />
                            </InputLineItem>
                            <InputLineItem title="">
                                <Button @click="openLlmInfo"> 使用说明 </Button>
                            </InputLineItem>
                        </div>
                        <!-- #endregion LLM配置 -->
                    </InputLine>

                    <InputLine
                        description="测试输入文本，看看翻译器是否正常工作"
                        icon="pi pi-check"
                        title="测试当前引擎"
                    >
                        <template #right>
                            <Button
                                label="测试翻译"
                                :loading="testTranslateLoading"
                                @click="testTranslate"
                            />
                            <InputText
                                v-model.trim="testText"
                                :placeholder="testDefaultText"
                                type="text"
                                @blur="testText || (testText = testDefaultText)"
                            />
                        </template>
                    </InputLine>
                </div>

                <!--info-->
                <div v-else-if="activeTab === 'info'" key="info" class="settings-tab-content">
                    <InfoTable
                        :info="{
                            default: [{ 应用名: appName }, { 版本号: appVersion }]
                        }"
                        style="margin-bottom: 3rem"
                    />

                    <!-- 路径操作按钮 -->
                    <div style="display: flex; gap: 0.5rem; flex-direction: column; width: 10rem">
                        <Button icon="pi pi-folder-open" label="打开根目录" @click="openAppPath" />
                        <Button
                            icon="pi pi-folder-open"
                            label="打开临时目录"
                            severity="secondary"
                            @click="openTempPath"
                        />
                        <Button
                            icon="pi pi-folder-open"
                            label="打开日志文件"
                            severity="secondary"
                            @click="openLogsFile"
                        />
                    </div>
                </div>
            </transition>
        </Scroll>
    </div>
</template>

<style lang="scss" scoped>
.settings-view {
    width: 100%;
    height: 100%;
}

.tab {
    display: flex;
    position: relative;
    border-bottom: var(--separator);

    .tab-item {
        width: 5rem;
        height: var(--header-height);
        cursor: pointer;
        display: flex;
        justify-content: center;

        .tab-content-wrapper {
            display: flex;
            align-items: center;
            gap: 0.25rem;
        }
    }

    .active-indicator {
        position: absolute;
        top: calc(var(--header-height) - 0.25rem);
        left: 1.5rem;
        transform: translateX(-50%);
        width: 2rem;
        height: 0.25rem;
        background-color: var(--p-primary-color);
        border-radius: 0.125rem;
        transition: all 0.3s var(--animation-type);
    }
}

.content {
    height: calc(100% - var(--header-height)) !important;

    .settings-tab-content {
        padding: 1.25rem 1.25rem 5rem;

        .settings-view-description {
            margin: 0.5rem 0 0 0.5rem;
            font-size: 0.75rem;
            height: 1rem;
            color: var(--p-text-muted-color);
        }
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
}

// 设置界面内部样式
h1 {
    font-size: 1rem;
    font-weight: bold;
    margin: 1.5rem 0 0 0.5rem;
}
</style>
