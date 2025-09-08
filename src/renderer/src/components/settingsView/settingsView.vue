<script lang="ts" setup>
import { settingsStore } from '@renderer/stores/settings'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import ToggleSwitch from 'primevue/toggleswitch'
import Select from 'primevue/select'
import ScrollPanel from 'primevue/scrollpanel'
import { ref } from 'vue'
import SettingsLine from './settingsLine.vue'
import SettingsLineItem from './settingsLineItem.vue'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Dialog from 'primevue/dialog'
import LlmInfo from '@renderer/components/settingsView/llmInfo.vue'
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'
import { TransHelper } from '@renderer/helper'
import { Scraper } from '@renderer/scraper'

const settings = settingsStore()
const translateEngineConfigRef = ref()
const llmModels = ref<string[]>([])
const showLocalLLMInfoDialog = ref(false)
const testDefaultText = 'こんにちは世界'
const testText = ref(testDefaultText)
const toast = useToast()

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
	const result = await TransHelper.translate(testText.value)
	if (result.ok) {
		toast.add({
			severity: 'success',
			summary: '翻译成功',
			detail: result.text,
			life: 3000
		})
	} else {
		toast.add({
			severity: 'error',
			summary: '翻译失败',
			detail: '翻译服务异常',
			life: 3000
		})
	}
}
</script>

<template>
	<div class="settings-view">
		<Toast position="top-right" />
		<div class="tab">
			<div
				v-for="tab in tabs"
				:key="tab.id"
				:class="{ active: activeTab === tab.id }"
				:title="tab.name"
				class="tab-item"
				@click="switchTab(tab.id)"
			>
				<div class="tab-content-wrapper">
					<i :class="tab.icon" style="font-size: 0.9rem"></i>
					<span class="tab-name">{{ tab.name }}</span>
				</div>
			</div>
			<transition name="indicator">
				<div
					:style="{
						transform: `translateX(${tabs.findIndex((tab) => tab.id === activeTab) * 5}rem)`
					}"
					class="active-indicator"
				></div>
			</transition>
		</div>
		<ScrollPanel class="content">
			<transition name="slide-up">
				<div v-if="activeTab === 'settings'" key="settings" class="tab-content">
					<h1 style="margin-top: 0">输出目录</h1>

					<SettingsLine v-for="scraper in Scraper.instances" :title="scraper.scraperName">
						<template #right>
							<InputText
								v-model="settings.scraperPath[scraper.scraperName]"
								type="text"
							/>
						</template>
					</SettingsLine>

					<p class="settings-view-description">
						为每个刮削器设置的单独的输出路径。如果使用相对路径，则在app根目录下创建对应文件夹
					</p>

					<h1>网络</h1>

					<SettingsLine icon="pi pi-hourglass" title="连接超时（秒）">
						<template #right>
							<InputNumber
								v-model="settings.net.timeout"
								:max="30"
								:min="0"
								showButtons
							/>
						</template>
					</SettingsLine>

					<SettingsLine
						description="连接失败后，重连的次数"
						icon="pi pi-sync"
						title="重连次数"
					>
						<template #right>
							<InputNumber
								v-model="settings.net.retry"
								:max="10"
								:min="0"
								showButtons
							/>
						</template>
					</SettingsLine>

					<SettingsLine
						description="同一个网站中，每次请求之间的时间间隔不小于此值，以免触发反爬"
						icon="pi pi-clock"
						title="最小请求间隔时间（毫秒）"
					>
						<template #right>
							<InputNumber
								v-model="settings.net.delay"
								:max="10000"
								:min="0"
								:step="1000"
								:useGrouping="false"
								showButtons
							/>
						</template>
					</SettingsLine>

					<SettingsLine :collapsible="true" icon="pi pi-globe" title="网络代理">
						<SettingsLineItem title="启用">
							<ToggleSwitch v-model="settings.proxy.enable" />
						</SettingsLineItem>
						<SettingsLineItem title="主机">
							<InputText v-model="settings.proxy.host" type="text" />
						</SettingsLineItem>
						<SettingsLineItem title="端口">
							<InputNumber
								v-model="settings.proxy.port"
								:max="65535"
								:min="1"
								:useGrouping="false"
							/>
						</SettingsLineItem>
					</SettingsLine>

					<h1>翻译</h1>

					<SettingsLine icon="pi pi-language" title="启用">
						<template #right>
							<ToggleSwitch v-model="settings.translate.enable" />
						</template>
					</SettingsLine>

					<SettingsLine
						description="当一次AI翻译失败后，会自动调用谷歌翻译，再次翻译这段内容"
						icon="pi pi-sync"
						title="AI翻译失败后用谷歌翻译"
					>
						<template #right>
							<ToggleSwitch v-model="settings.translate.retryWithGoogle" />
						</template>
					</SettingsLine>

					<SettingsLine icon="pi pi-microchip" title="翻译引擎">
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
					</SettingsLine>

					<SettingsLine
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
						<div v-if="settings.translate.translateEngine === 'gemini'">
							<SettingsLineItem title="API Key">
								<Button
									as="a"
									href="https://aistudio.google.com/app/apikey"
									target="_blank"
									variant="link"
								>
									获取API Key
								</Button>
								<InputText v-model="settings.translate.gemini.apiKey" type="text" />
							</SettingsLineItem>
							<SettingsLineItem title="模型">
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
								<InputText v-model="settings.translate.gemini.model" type="text" />
							</SettingsLineItem>
						</div>
						<div v-if="settings.translate.translateEngine === 'localLLM'">
							<SettingsLineItem title="主机">
								<InputText
									v-model="settings.translate.localLLM.host"
									type="text"
									@change="fetchLLMModels"
								/>
							</SettingsLineItem>
							<SettingsLineItem title="端口">
								<InputNumber
									v-model="settings.translate.localLLM.port"
									:max="65535"
									:min="1"
									:useGrouping="false"
									@change="fetchLLMModels"
								/>
							</SettingsLineItem>
							<SettingsLineItem title="模型">
								<Message
									v-if="
										settings.translate.translateEngine === 'localLLM' &&
										llmModels.length === 0
									"
									severity="error"
									>请先启动本地LLM服务！</Message
								>
								<Select
									v-model="settings.translate.localLLM.model"
									:options="llmModels"
								/>
							</SettingsLineItem>
							<SettingsLineItem title="">
								<Button @click="showLocalLLMInfoDialog = true"> 使用说明 </Button>
								<Dialog
									v-model:visible="showLocalLLMInfoDialog"
									:closable="true"
									:closeOnEscape="true"
									:contentStyle="{ userSelect: 'text' }"
									:dismissableMask="true"
									:modal="true"
									header="本地LLM大模型使用说明"
									@after-hide="fetchLLMModels"
								>
									<LlmInfo />
								</Dialog>
							</SettingsLineItem>
						</div>
					</SettingsLine>

					<SettingsLine
						description="测试输入文本，看看翻译器是否正常工作"
						icon="pi pi-check"
						title="测试当前引擎"
					>
						<template #right>
							<Button @click="testTranslate"> 测试翻译 </Button>
							<InputText
								v-model="testText"
								:placeholder="testDefaultText"
								type="text"
								@blur="testText || (testText = testDefaultText)"
							/>
						</template>
					</SettingsLine>
				</div>

				<!--info-->
				<div v-else-if="activeTab === 'info'" key="info" class="tab-content">123</div>
			</transition>
		</ScrollPanel>
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
	height: calc(100% - var(--header-height));

	.tab-content {
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
