<script lang="ts" setup>
import InputLine from '@renderer/components/control/inputLine/inputLine.vue'
import InputLineItem from '@renderer/components/control/inputLine/inputLineItem.vue'
import { showGlobalWarn } from '@renderer/components/control/message'
import Scroll from '@renderer/components/control/scroll/scroll.vue'
import DependencyPanel from '@renderer/components/settingsView/dependencyPanel.vue'
import UpdatePanel from '@renderer/components/settingsView/updatePanel.vue'
import {
    AgentHelper,
    AiApiFormatOptions,
    AiProviderDescriptions,
    AiProviderOptions,
    DeepseekReasoningEffortArray,
    getAgentConfig,
    getRetryMessage,
    getSearchConfig,
    LogHelper,
    OpenAIReasoningEffortArray,
    SearchProviderDescriptions,
    SearchProviderOptions,
    TransHelper
} from '@renderer/helper'
import { ipc } from '@renderer/ipc'
import { Scraper } from '@renderer/scraper'
import { dependencyStore, settingsStore } from '@renderer/stores'
import { isAgentSuccess } from '@shared'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import ToggleSwitch from 'primevue/toggleswitch'
import { useToast } from 'primevue/usetoast'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

interface IProps {
    /** 是否为主标签页 */
    active?: boolean
}

const props = withDefaults(defineProps<IProps>(), { active: true })

const OPENAI_API_KEYS_URL = 'https://platform.openai.com/api-keys'
const OPENAI_MODELS_URL = 'https://platform.openai.com/docs/models'
const DEEPSEEK_API_KEYS_URL = 'https://platform.deepseek.com/api_keys'
const DEEPSEEK_PRICING_URL = 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing'
const TAVILY_API_KEYS_URL = 'https://app.tavily.com/home'
const testDefaultText = 'こんにちは世界'
/** 标签页配置 */
const tabs = [
    { id: 'settings', name: '设置', icon: 'pi pi-cog' },
    { id: 'dependency', name: '依赖', icon: 'pi pi-box' },
    { id: 'info', name: '关于', icon: 'pi pi-info-circle' }
]

const settings = settingsStore()
const dependency = dependencyStore()
const toast = useToast()

const aiConfigRef = ref()
const searchConfigRef = ref()
const proxyConfigRef = ref()
const testText = ref(testDefaultText)
const testTranslateLoading = ref(false)
const testConnectionLoading = ref(false)
const testSearchLoading = ref(false)
const activeTab = ref('settings')
/** 连接测试取消句柄 */
let testConnectionController: AbortController | null = null
/** 翻译测试取消句柄 */
let testTranslateController: AbortController | null = null

/** 当前服务商名称 */
const aiProviderLabel = computed(
    () => AiProviderOptions.find((item) => item.value === settings.ai.provider)?.label ?? ''
)

/** 当前搜索服务商名称 */
const searchProviderLabel = computed(
    () => SearchProviderOptions.find((item) => item.value === settings.search.provider)?.label ?? ''
)

/**
 * 切换标签页
 * @param tabId 标签 ID
 */
function switchTab(tabId: string) {
    if (tabId === activeTab.value) return
    activeTab.value = tabId
}

/**
 * 跳转到代理设置
 */
async function openProxySetting() {
    activeTab.value = 'settings'
    await nextTick()
    proxyConfigRef.value?.open()
}

/**
 * 测试连接
 */
async function testConnection() {
    if (testConnectionLoading.value) return

    // 测试固定关闭思考
    const config = getAgentConfig({
        ...settings.ai,
        openai: { ...settings.ai.openai, reasoningEffort: 'none' },
        deepseek: { ...settings.ai.deepseek, reasoningEffort: 'none' },
        custom: { ...settings.ai.custom, reasoningEffort: 'none' }
    })
    if (!config) {
        toast.add({
            severity: 'error',
            summary: '连接失败',
            detail: '请先填写模型服务商配置',
            life: 3000
        })
        return
    }

    testConnectionLoading.value = true

    const controller = new AbortController()
    testConnectionController = controller

    try {
        let retryWarned = false

        const result = await AgentHelper.ask({
            config,
            prompt: '只回复 ok',
            timeout: 60 * 1000,
            maxRetries: 0,
            skipLog: true,
            signal: controller.signal,
            onRetry: (info) => {
                const message = getRetryMessage(info)
                LogHelper.warn(message)

                // 只提示一次
                if (retryWarned) return
                retryWarned = true
                showGlobalWarn(message)
            }
        })

        if (result.cancelled) return

        if (isAgentSuccess(result.finishReason) && result.text.trim()) {
            LogHelper.debug(`AI连接成功：${config.provider}:${config.model}`, result.text)
            toast.add({
                severity: 'success',
                summary: '连接成功',
                detail: `${config.provider}: ${config.model}`,
                life: 3000
            })
        } else {
            const detail = result.error
                ? `失败原因：${result.error.slice(0, 200)}`
                : '请检查 API Key、Base URL 或模型名称'

            toast.add({
                severity: 'error',
                summary: '连接失败',
                detail,
                life: 3000
            })
        }
    } finally {
        if (testConnectionController === controller) {
            testConnectionController = null
        }
        testConnectionLoading.value = false
    }
}

/**
 * 测试搜索连接
 */
async function testSearchConnection() {
    if (testSearchLoading.value) return

    const config = getSearchConfig(settings.search)
    if (!config) {
        toast.add({
            severity: 'error',
            summary: '连接失败',
            detail: '请先填写搜索服务商的 API Key',
            life: 3000
        })
        return
    }

    testSearchLoading.value = true

    try {
        const result = await ipc.search.test.mutate({ config })
        toast.add({
            severity: 'success',
            summary: '连接成功',
            detail: `${config.provider}：返回 ${result.count} 条结果`,
            life: 3000
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        toast.add({
            severity: 'error',
            summary: '连接失败',
            detail: message.slice(0, 200),
            life: 3000
        })
    } finally {
        testSearchLoading.value = false
    }
}

/**
 * 测试翻译
 */
async function testTranslate() {
    if (testTranslateLoading.value) return

    testTranslateLoading.value = true

    const controller = new AbortController()
    testTranslateController = controller

    try {
        let reasoningText = ''

        const result = await TransHelper.translate(
            testText.value,
            true,
            (_, reasoningData, reset) => {
                if (reset) {
                    reasoningText = ''
                    return
                }

                reasoningText += reasoningData
            },
            controller.signal
        )

        if (controller.signal.aborted) return

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
        if (testTranslateController === controller) {
            testTranslateController = null
        }
        testTranslateLoading.value = false
    }
}

/**
 * 取消测试请求
 */
function abortTests() {
    testConnectionController?.abort()
    testTranslateController?.abort()
}

// 离开页面时取消测试
watch(
    () => props.active,
    (active) => {
        if (!active) abortTests()
    }
)

// 缺少依赖时展示依赖页
watch(
    () => dependency.missingRequired,
    (value) => {
        if (value) activeTab.value = 'dependency'
    }
)

onBeforeUnmount(abortTests)
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
                v-if="activeTab === 'dependency' || activeTab === 'info'"
                class="tab-tip"
                @click="openProxySetting"
            >
                <i class="pi pi-github" />
                <span>下载源为 GitHub，配置代理可加速</span>
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

                    <InputLine
                        ref="proxyConfigRef"
                        :collapsible="true"
                        icon="pi pi-globe"
                        title="网络代理"
                    >
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

                    <h1>AI</h1>

                    <InputLine icon="pi pi-microchip" title="模型服务商">
                        <template #right>
                            <Select
                                v-model="settings.ai.provider"
                                :options="AiProviderOptions as any"
                                option-label="label"
                                option-value="value"
                                @change="aiConfigRef.close()"
                            />
                        </template>
                    </InputLine>

                    <InputLine
                        ref="aiConfigRef"
                        :collapsible="true"
                        :description="AiProviderDescriptions[settings.ai.provider]"
                        :title="`${aiProviderLabel}配置`"
                    >
                        <!-- #region OpenAI配置  -->
                        <div v-if="settings.ai.provider === 'openai'">
                            <InputLineItem title="API Key">
                                <Button
                                    as="a"
                                    :href="OPENAI_API_KEYS_URL"
                                    target="_blank"
                                    variant="link"
                                >
                                    获取API Key
                                </Button>
                                <InputText v-model.trim="settings.ai.openai.apiKey" type="text" />
                            </InputLineItem>
                            <InputLineItem title="模型">
                                <Button
                                    as="a"
                                    :href="OPENAI_MODELS_URL"
                                    target="_blank"
                                    variant="link"
                                >
                                    查看全部模型
                                </Button>
                                <InputText v-model.trim="settings.ai.openai.model" type="text" />
                            </InputLineItem>
                            <InputLineItem title="思考强度">
                                <Select
                                    v-model="settings.ai.openai.reasoningEffort"
                                    :options="OpenAIReasoningEffortArray as any"
                                />
                            </InputLineItem>
                        </div>
                        <!-- #endregion OpenAI配置 -->

                        <!-- #region Deepseek配置  -->
                        <div v-if="settings.ai.provider === 'deepseek'">
                            <InputLineItem title="API Key">
                                <Button
                                    as="a"
                                    :href="DEEPSEEK_API_KEYS_URL"
                                    target="_blank"
                                    variant="link"
                                >
                                    获取API Key
                                </Button>
                                <InputText v-model.trim="settings.ai.deepseek.apiKey" type="text" />
                            </InputLineItem>
                            <InputLineItem title="模型">
                                <Button
                                    as="a"
                                    :href="DEEPSEEK_PRICING_URL"
                                    target="_blank"
                                    variant="link"
                                >
                                    查看全部模型
                                </Button>
                                <InputText v-model.trim="settings.ai.deepseek.model" type="text" />
                            </InputLineItem>
                            <InputLineItem title="思考强度">
                                <Select
                                    v-model="settings.ai.deepseek.reasoningEffort"
                                    :options="DeepseekReasoningEffortArray as any"
                                />
                            </InputLineItem>
                            <InputLineItem title="官方联网搜索">
                                <ToggleSwitch
                                    v-model="settings.ai.deepseek.webSearch"
                                    v-tooltip="'启用模型自身的联网搜索能力'"
                                />
                            </InputLineItem>
                        </div>
                        <!-- #endregion Deepseek配置 -->

                        <!-- #region 自定义配置  -->
                        <div v-if="settings.ai.provider === 'custom'">
                            <InputLineItem title="Base URL">
                                <InputText
                                    v-model.trim="settings.ai.custom.baseUrl"
                                    placeholder="https://api.example.com/v1"
                                    type="text"
                                />
                            </InputLineItem>
                            <InputLineItem title="API Key">
                                <InputText v-model.trim="settings.ai.custom.apiKey" type="text" />
                            </InputLineItem>
                            <InputLineItem title="API 格式">
                                <Select
                                    v-model="settings.ai.custom.apiFormat"
                                    :options="AiApiFormatOptions as any"
                                    option-label="label"
                                    option-value="value"
                                />
                            </InputLineItem>
                            <InputLineItem title="模型">
                                <InputText v-model.trim="settings.ai.custom.model" type="text" />
                            </InputLineItem>
                            <InputLineItem title="思考强度">
                                <Select
                                    v-model="settings.ai.custom.reasoningEffort"
                                    :options="OpenAIReasoningEffortArray as any"
                                />
                            </InputLineItem>
                        </div>
                        <!-- #endregion 自定义配置 -->
                    </InputLine>

                    <InputLine icon="pi pi-link" title="测试连接">
                        <template #right>
                            <Button
                                label="测试连接"
                                :loading="testConnectionLoading"
                                @click="testConnection"
                            />
                        </template>
                    </InputLine>

                    <h1>联网搜索</h1>

                    <InputLine icon="pi pi-search" title="搜索服务商">
                        <template #right>
                            <Select
                                v-model="settings.search.provider"
                                :options="SearchProviderOptions as any"
                                option-label="label"
                                option-value="value"
                                @change="searchConfigRef.close()"
                            />
                        </template>
                    </InputLine>

                    <InputLine
                        ref="searchConfigRef"
                        :collapsible="true"
                        :description="SearchProviderDescriptions[settings.search.provider]"
                        :title="`${searchProviderLabel}配置`"
                    >
                        <div v-if="settings.search.provider === 'tavily'">
                            <InputLineItem title="API Key">
                                <Button
                                    as="a"
                                    :href="TAVILY_API_KEYS_URL"
                                    target="_blank"
                                    variant="link"
                                >
                                    获取API Key
                                </Button>
                                <InputText
                                    v-model.trim="settings.search.tavily.apiKey"
                                    type="text"
                                />
                            </InputLineItem>
                        </div>
                        <div v-if="settings.search.provider === 'deepseek'">
                            <InputLineItem title="API Key">
                                <Button
                                    as="a"
                                    :href="DEEPSEEK_API_KEYS_URL"
                                    target="_blank"
                                    variant="link"
                                >
                                    获取API Key
                                </Button>
                                <InputText
                                    v-model.trim="settings.search.deepseek.apiKey"
                                    type="text"
                                />
                            </InputLineItem>
                        </div>
                    </InputLine>

                    <InputLine icon="pi pi-link" title="测试连接">
                        <template #right>
                            <Button
                                label="测试连接"
                                :loading="testSearchLoading"
                                @click="testSearchConnection"
                            />
                        </template>
                    </InputLine>

                    <h1>翻译</h1>

                    <InputLine icon="pi pi-language" title="启用">
                        <template #right>
                            <ToggleSwitch v-model="settings.translate.enable" />
                        </template>
                    </InputLine>

                    <InputLine
                        description="测试输入文本，看看翻译是否正常工作"
                        icon="pi pi-check"
                        title="测试翻译"
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

                    <h1>更新</h1>

                    <InputLine icon="pi pi-cloud-download" title="自动检查更新">
                        <template #right>
                            <ToggleSwitch v-model="settings.update.autoCheck" />
                        </template>
                    </InputLine>
                </div>

                <!-- 依赖 -->
                <div
                    v-else-if="activeTab === 'dependency'"
                    key="dependency"
                    class="settings-tab-content"
                >
                    <DependencyPanel />
                </div>

                <!-- 关于 -->
                <div v-else-if="activeTab === 'info'" key="info" class="settings-tab-content">
                    <UpdatePanel />
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

    .tab-tip {
        margin-left: auto;
        padding-right: 1.5rem;
        display: flex;
        align-items: center;
        gap: 0.25rem;
        font-size: 0.75rem;
        color: var(--p-text-muted-color);
        cursor: pointer;
        transition: color 0.3s var(--animation-type);

        &:hover {
            color: var(--p-primary-color);
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

    /* Tab 内容滑动动画 */
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

h1 {
    font-size: 1rem;
    font-weight: bold;
    margin: 1.5rem 0 0 0.5rem;
}
</style>
