<script lang="ts" setup>
import type { IActor, IVideoFile } from '@renderer/scraper'
import type { Ref } from 'vue'

import { useMessage } from '@renderer/components/control/message'
import Scroll from '@renderer/components/control/scroll/scroll.vue'
import ImageEditor from '@renderer/components/manageView/editor/imageEditor.vue'
import { readExtrafanart, scanFiles } from '@renderer/components/manageView/func'
import {
    EncodeHelper,
    isNumeric,
    isUrl,
    isValidDate,
    LogHelper,
    PathHelper,
    TransHelper
} from '@renderer/helper'
import { createVideoFile, Scraper } from '@renderer/scraper'
import { useEditeScraper } from '@renderer/scraper/hooks/useEditeScraper'
import { settingsStore } from '@renderer/stores'
import { isEqual } from 'es-toolkit'
import { cloneDeep } from 'es-toolkit/object'
import Button from 'primevue/button'
import Chip from 'primevue/chip'
import FloatLabel from 'primevue/floatlabel'
import InputText from 'primevue/inputtext'
import ProgressBar from 'primevue/progressbar'
import Select from 'primevue/select'
import SplitButton from 'primevue/splitbutton'
import Tag from 'primevue/tag'
import Textarea from 'primevue/textarea'
import { inject, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

const dialogRef = inject('dialogRef') as any
const { toast } = useMessage()
const { scraperAll, scraperField, scraperSave, isScraperRunning, isEditeScraperRunning } =
    useEditeScraper()
const settings = settingsStore()

const video = dialogRef.value.data.video as IVideoFile

const newVideo = ref<IVideoFile>(createVideoFile())
const isSaving = ref(false)
const isTranslatingPlot = ref(false)
const isCanceling = ref(false)
const scraperProgress = ref(0)
const currentScraperController = ref<AbortController | null>(null)

// tab部分
const tabs = [
    { id: 'edit', name: '编辑', icon: 'pi pi-pencil' },
    { id: 'image', name: '图片', icon: 'pi pi-image' },
    { id: 'info', name: '信息', icon: 'pi pi-info-circle' }
]
const activeTab = ref('edit')
function switchTab(tabId: string) {
    if (tabId === activeTab.value) return
    activeTab.value = tabId
}

// 变量
const addActorValue = ref<IActor>({
    name: '',
    role: '',
    imgUrl: ''
})
const addTagValue = ref('')
const addGenreValue = ref('')

// 预览图片
const previewImage = ref<string | null>(null)

/**
 * 将标签/类型值规范化为字符串，兼容历史脏数据
 * @param value 原始值
 */
function normalizeTextValue(value: unknown): string {
    if (typeof value === 'string' || typeof value === 'number') {
        return String(value).trim()
    }

    if (value && typeof value === 'object') {
        const text = Reflect.get(value, '#')
        if (typeof text === 'string' || typeof text === 'number') {
            return String(text).trim()
        }
    }

    return ''
}

/**
 * 规范化字符串数组字段，过滤空值
 * @param values 原始数组
 */
function normalizeTextList(values: unknown[]): string[] {
    return values.map((value) => normalizeTextValue(value)).filter(Boolean)
}

/**
 * 规范化当前视频中的标签和类型
 */
function normalizeTagGenre() {
    newVideo.value.tag = normalizeTextList(newVideo.value.tag)
    newVideo.value.genre = normalizeTextList(newVideo.value.genre)
}

/**
 * 创建刮削控制器
 */
function createScraperController() {
    const controller = new AbortController()
    currentScraperController.value = controller
    return controller
}

/**
 * 刮削单个字段
 * @param funcName 刮削函数名称
 */
async function runScraperField(funcName: Parameters<typeof scraperField>[1]) {
    const controller = createScraperController()

    try {
        await scraperField(newVideo.value, funcName, controller.signal, (progress) => {
            scraperProgress.value = progress
        })
    } finally {
        if (currentScraperController.value === controller) {
            currentScraperController.value = null
        }
    }
}

/**
 * 刮削全部字段
 */
async function runScraperAll() {
    const controller = createScraperController()

    try {
        await scraperAll(newVideo.value, controller.signal, (progress) => {
            scraperProgress.value = progress
        })
    } finally {
        if (currentScraperController.value === controller) {
            currentScraperController.value = null
        }
    }
}

/**
 * 取消当前刮削
 */
function cancelScraperTask() {
    isCanceling.value = true
    currentScraperController.value?.abort()
}

watch(isEditeScraperRunning, (running) => {
    if (!running) {
        isCanceling.value = false
        scraperProgress.value = 0
    }
})

/**
 * 保存逻辑
 */
async function onSave() {
    const sourceVideoFile = video
    const scraper = Scraper.getCurrentScraperInstance()

    if (!scraper || isEditeScraperRunning.value) return

    normalizeTagGenre()

    // 如果视频没有修改，则不保存
    if (isEqual(newVideo.value, sourceVideoFile)) {
        toast.success('未修改，无需保存')
        dialogRef.value.close()
        return
    }

    if (isSaving.value) return
    isSaving.value = true

    // 保存
    const re = await scraperSave(newVideo.value, sourceVideoFile)
    if (re.hasError) {
        toast.error(`保存失败！${re.error}`)
        isSaving.value = false
        return
    }

    // 重新扫描文件
    await scanFiles(toast)

    // 先关闭弹窗并清空预览，释放旧图片文件引用
    previewImage.value = null
    isSaving.value = false
    toast.success('保存成功！')
    dialogRef.value.close(newVideo.value)

    // 等待界面完成更新后，再删除旧的空文件夹，避免 Windows 判定文件占用
    await nextTick()
    await PathHelper.removeEmptyFolders(Scraper.getCurrentScraperPath())
}

/**
 * 创建菜单项数组
 * @param inputRef 输入框的响应式引用
 */
function createMenuItems(inputRef: Ref<string>) {
    return [
        {
            label: '同时添加为标签和类型',
            command: () => {
                if (inputRef.value) {
                    newVideo.value.tag.push(inputRef.value)
                    newVideo.value.genre.push(inputRef.value)
                    inputRef.value = ''
                }
            }
        }
    ]
}

// 菜单选项
const tagMenuItems = createMenuItems(addTagValue)
const genreMenuItems = createMenuItems(addGenreValue)

/**
 * 获取编号对应的跳转链接
 * @param sourceName 编号源名称
 */
function getNumLink(sourceName: string) {
    const numSource = Scraper.getScraperInstance(newVideo.value.scraperName)?.numSource || {}
    const template = numSource[sourceName]
    const num = newVideo.value.num[sourceName]?.trim()

    if (!template || !num) return undefined

    return template.replace('{num}', EncodeHelper.encodeUrl(num))
}

/**
 * 打开编号对应的外部链接
 * @param sourceName 编号源名称
 */
function openNumLink(sourceName: string) {
    const link = getNumLink(sourceName)
    if (!link) return

    window.open(link, '_blank')
}

/**
 * 格式化文件大小
 * @param size 文件大小
 */
function formatFileSize(size: number) {
    if (size < 1024) return `${size} B`
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`
    if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(2)} MB`

    return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`
}

/**
 * 格式化时间
 * @param time 时间
 */
function formatVideoTime(time: IVideoFile['joinTime']) {
    return time.format('YYYY年M月D日，HH:mm:ss')
}

/**
 * 播放视频
 */
function openVideoPath() {
    PathHelper.openInExplorer(video.path.toString())
}

/**
 * 打开视频所在目录
 */
function openVideoDir() {
    PathHelper.openInExplorer(video.dir.toString())
}

/**
 * 翻译剧情
 */
async function transPlot() {
    if (isTranslatingPlot.value) return

    LogHelper.log('翻译剧情...')

    isTranslatingPlot.value = true

    try {
        let text = ''
        await TransHelper.translate(newVideo.value.plot, true, (data) => {
            text = text + data
            newVideo.value.plot = TransHelper.formatTranslateText(text)
        })

        console.info(text) // 打印一下方便debug
        LogHelper.log('翻译完成')
    } finally {
        isTranslatingPlot.value = false
    }
}

/**
 * 处理鼠标返回
 */
function handleMouseBackAction(event: MouseEvent) {
    // 鼠标侧键返回
    if (event.button === 3) {
        event.preventDefault()
        dialogRef.value.close()
    }
}

onMounted(() => {
    window.addEventListener('mouseup', handleMouseBackAction)
})

onUnmounted(() => {
    window.removeEventListener('mouseup', handleMouseBackAction)
})

onMounted(async () => {
    newVideo.value = cloneDeep(video) // 深拷贝，避免响应式对象引用问题
    normalizeTagGenre()

    // 如果未设置刮削器，或当前刮削器已不在列表中，则默认使用当前选择的刮削器
    if (
        !newVideo.value.scraperName ||
        !Scraper.instances.some((scraper) => scraper.scraperName === newVideo.value.scraperName)
    ) {
        newVideo.value.scraperName = settings.currentScraper
    }

    // 读取extrafanart
    readExtrafanart(video.dir, newVideo.value, video)
})
</script>

<template>
    <div class="manage-view-editor">
        <!-- 进度条 -->
        <ProgressBar
            :show-value="false"
            :value="scraperProgress"
            class="scraper-progress"
            :style="{
                opacity: isEditeScraperRunning ? 1 : 0
            }"
        />
        <!-- 顶部标签部分 -->
        <div class="header">
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
                    transform: `translateX(${tabs.findIndex((tab) => tab.id === activeTab) * 5 + 0.5}rem)`
                }"
                class="active-indicator"
            />

            <!-- 取消按钮 -->
            <div v-if="isEditeScraperRunning" style="margin-left: auto; margin-right: 2rem">
                <Button
                    style="height: 1.75rem"
                    :loading="isCanceling"
                    label="取消"
                    size="small"
                    @click="cancelScraperTask"
                />
            </div>
        </div>
        <Scroll style="height: calc(90vh - 0.75rem - var(--header-height) - var(--header-height))">
            <div class="content">
                <!-- #region 编辑部分  -->
                <div v-show="activeTab === 'edit'" class="form-container">
                    <h2 style="margin-top: 0">
                        <i class="pi pi-search section-title-icon" />
                        刮削器
                    </h2>
                    <div style="display: flex">
                        <Select
                            v-model="newVideo.scraperName"
                            v-tooltip.top="'选择刮削器'"
                            :options="Scraper.instances.map((scraper) => scraper.scraperName)"
                            style="flex: 1"
                        />
                        <Button
                            v-tooltip="'刮削全部信息'"
                            :disabled="isScraperRunning"
                            icon="pi pi-search"
                            variant="outlined"
                            style="margin-left: 0.5rem; height: fit-content"
                            @click="runScraperAll"
                        />
                    </div>

                    <h2>
                        <i class="pi pi-hashtag section-title-icon" />
                        编号
                    </h2>
                    <FloatLabel
                        v-for="value in Object.keys(
                            Scraper.getScraperInstance(newVideo.scraperName)?.numSource || {}
                        )"
                        :key="value"
                        v-tooltip.top="
                            '作品在刮削网站的编号。\n获取作品页面时，有编号就直接进入该页面，否则会先用原标题进行搜索。'
                        "
                        variant="on"
                        style="display: flex"
                    >
                        <InputText id="title_num" v-model.trim="newVideo.num[value]" />
                        <label for="title_num">{{ value }}</label>
                        <Button
                            v-tooltip="'打开链接'"
                            :disabled="isScraperRunning || !getNumLink(value)"
                            icon="pi pi-external-link"
                            style="margin-left: 0.5rem"
                            variant="outlined"
                            @click="openNumLink(value)"
                        />
                    </FloatLabel>

                    <h2>
                        <i class="pi pi-bookmark section-title-icon" />
                        标题
                    </h2>
                    <FloatLabel variant="on" style="display: flex">
                        <InputText id="title_label" v-model.trim="newVideo.title" />
                        <label for="title_label">标题</label>
                        <Button
                            v-tooltip="'搜索'"
                            :disabled="isScraperRunning"
                            icon="pi pi-search"
                            variant="outlined"
                            style="margin-left: 0.5rem"
                            @click="runScraperField('parseTitle')"
                        />
                    </FloatLabel>

                    <FloatLabel
                        v-tooltip.top="'原始标题，jellyfin中会显示在大标题下方作为小标题'"
                        variant="on"
                        style="display: flex"
                    >
                        <InputText
                            id="original_title_label"
                            v-model.trim="newVideo.originaltitle"
                        />
                        <label for="original_title_label">原标题</label>
                        <Button
                            v-tooltip="'搜索'"
                            :disabled="isScraperRunning"
                            icon="pi pi-search"
                            variant="outlined"
                            style="margin-left: 0.5rem"
                            @click="runScraperField('parseOriginaltitle')"
                        />
                    </FloatLabel>

                    <FloatLabel
                        v-tooltip.top="'名称排序时会以此为标准'"
                        variant="on"
                        style="display: flex"
                    >
                        <InputText id="sort_title_label" v-model.trim="newVideo.sorttitle" />
                        <label for="sort_title_label">排序标题</label>
                        <Button
                            v-tooltip="'搜索'"
                            :disabled="isScraperRunning"
                            icon="pi pi-search"
                            variant="outlined"
                            style="margin-left: 0.5rem"
                            @click="runScraperField('parseSorttitle')"
                        />
                    </FloatLabel>

                    <FloatLabel variant="on" style="display: flex">
                        <InputText id="sort_title_label" v-model.trim="newVideo.set" />
                        <label for="sort_title_label">影片系列</label>
                        <Button
                            v-tooltip="'搜索'"
                            :disabled="isScraperRunning"
                            icon="pi pi-search"
                            variant="outlined"
                            style="margin-left: 0.5rem"
                            @click="runScraperField('parseSet')"
                        />
                    </FloatLabel>

                    <h2>
                        <i class="pi pi-file-edit section-title-icon" />
                        介绍
                    </h2>
                    <FloatLabel variant="on" style="display: flex">
                        <Textarea
                            id="plot_label"
                            v-model.trim="newVideo.plot"
                            auto-resize
                            rows="5"
                            style="width: 100%"
                        />
                        <label for="plot_label">内容简介</label>
                        <div style="display: flex; flex-direction: column; gap: 0.5rem">
                            <Button
                                v-tooltip="'搜索'"
                                :disabled="isScraperRunning"
                                icon="pi pi-search"
                                variant="outlined"
                                style="margin-left: 0.5rem; height: fit-content"
                                @click="runScraperField('parsePlot')"
                            />
                            <Button
                                v-tooltip="'对当前文本进行翻译'"
                                :disabled="isScraperRunning"
                                :loading="isTranslatingPlot"
                                icon="pi pi-language"
                                variant="outlined"
                                style="margin-left: 0.5rem; height: fit-content"
                                @click="transPlot"
                            />
                        </div>
                    </FloatLabel>

                    <FloatLabel variant="on" style="display: flex">
                        <InputText id="tagline_label" v-model.trim="newVideo.tagline" />
                        <label for="tagline_label">宣传词</label>
                        <Button
                            v-tooltip="'搜索'"
                            :disabled="isScraperRunning"
                            icon="pi pi-search"
                            variant="outlined"
                            style="margin-left: 0.5rem; height: fit-content"
                            @click="runScraperField('parseTagline')"
                        />
                    </FloatLabel>

                    <h2>
                        <i class="pi pi-users section-title-icon" />
                        人员
                    </h2>
                    <FloatLabel variant="on" style="display: flex">
                        <InputText id="director_label" v-model.trim="newVideo.director" />
                        <label for="director_label">导演</label>
                        <Button
                            v-tooltip="'搜索'"
                            :disabled="isScraperRunning"
                            icon="pi pi-search"
                            variant="outlined"
                            style="margin-left: 0.5rem"
                            @click="runScraperField('parseDirector')"
                        />
                    </FloatLabel>

                    <!-- 演员 -->
                    <div style="display: flex">
                        <div style="flex: 1; gap: 1rem; display: flex; flex-direction: column">
                            <div
                                v-for="actor in newVideo.actor"
                                :key="actor.imgUrl"
                                class="flex-input"
                            >
                                <Button
                                    v-tooltip.top="'删除演员'"
                                    icon="pi pi-trash"
                                    severity="secondary"
                                    style="flex: none"
                                    @click="
                                        () => {
                                            newVideo.actor = newVideo.actor.filter(
                                                (a) => a !== actor
                                            )
                                        }
                                    "
                                />
                                <FloatLabel variant="on">
                                    <InputText id="mpaa_label" v-model.trim="actor.name" />
                                    <label for="mpaa_label">演员</label>
                                </FloatLabel>

                                <FloatLabel variant="on">
                                    <InputText id="mpaa_label" v-model.trim="actor.role" />
                                    <label for="mpaa_label">扮演角色</label>
                                </FloatLabel>

                                <FloatLabel style="flex: 2" variant="on">
                                    <InputText
                                        id="rating_label"
                                        v-model.trim="actor.imgUrl"
                                        :invalid="actor.imgUrl ? !isUrl(actor.imgUrl) : false"
                                    />
                                    <label for="rating_label">图像链接</label>
                                </FloatLabel>
                            </div>
                            <!-- 添加演员 -->
                            <div class="flex-input">
                                <Button
                                    v-tooltip.top="'添加演员'"
                                    icon="pi pi-plus"
                                    severity="secondary"
                                    style="flex: none"
                                    @click="
                                        () => {
                                            if (!addActorValue.name) return
                                            // 创建新对象副本，避免响应式对象引用问题
                                            newVideo.actor.push({
                                                name: addActorValue.name,
                                                role: addActorValue.role,
                                                imgUrl: addActorValue.imgUrl
                                            })
                                            addActorValue.name = ''
                                            addActorValue.role = ''
                                            addActorValue.imgUrl = ''
                                        }
                                    "
                                />
                                <FloatLabel variant="on">
                                    <InputText id="mpaa_label" v-model.trim="addActorValue.name" />
                                    <label for="mpaa_label">演员</label>
                                </FloatLabel>

                                <FloatLabel variant="on">
                                    <InputText id="mpaa_label" v-model.trim="addActorValue.role" />
                                    <label for="mpaa_label">扮演角色</label>
                                </FloatLabel>

                                <FloatLabel style="flex: 2" variant="on">
                                    <InputText
                                        id="rating_label"
                                        v-model.trim="addActorValue.imgUrl"
                                        :invalid="
                                            addActorValue.imgUrl
                                                ? !isUrl(addActorValue.imgUrl)
                                                : false
                                        "
                                    />
                                    <label for="rating_label">图像链接</label>
                                </FloatLabel>
                            </div>
                        </div>
                        <Button
                            v-tooltip="'搜索'"
                            :disabled="isScraperRunning"
                            icon="pi pi-search"
                            variant="outlined"
                            style="margin-left: 0.5rem; height: fit-content"
                            @click="runScraperField('parseActor')"
                        />
                    </div>

                    <!-- 标签 -->
                    <div class="flex-title">
                        <h2 style="margin-top: 0">
                            <i class="pi pi-tags section-title-icon" />
                            标签
                        </h2>
                        <FloatLabel class="add-input" variant="on">
                            <InputText id="add_tag_label" v-model.trim="addTagValue" size="small" />
                            <label for="add_tag_label">添加标签</label>
                        </FloatLabel>
                        <SplitButton
                            :model="tagMenuItems"
                            class="add-button"
                            icon="pi pi-plus"
                            severity="secondary"
                            size="small"
                            @click="
                                () => {
                                    if (addTagValue) {
                                        newVideo.tag.push(addTagValue)
                                        addTagValue = ''
                                    }
                                }
                            "
                        />
                    </div>
                    <div style="display: flex">
                        <div class="flex-content" style="flex: 1">
                            <transition-group
                                name="editable-chip"
                                tag="div"
                                class="editable-chip-list"
                            >
                                <div
                                    v-for="(tag, index) in newVideo.tag"
                                    :key="`${normalizeTextValue(tag)}-${index}`"
                                    class="editable-chip-wrapper"
                                >
                                    <Chip
                                        :label="normalizeTextValue(tag)"
                                        class="editable-chip"
                                        removable
                                        remove-icon="pi pi-times"
                                        @remove="
                                            () => {
                                                newVideo.tag = newVideo.tag.filter(
                                                    (_, i) => i !== index
                                                )
                                            }
                                        "
                                    />
                                </div>
                            </transition-group>
                        </div>
                        <Button
                            v-tooltip="'搜索'"
                            :disabled="isScraperRunning"
                            icon="pi pi-search"
                            variant="outlined"
                            style="margin-left: 0.5rem; height: fit-content"
                            @click="runScraperField('parseTag')"
                        />
                    </div>

                    <!-- 类型 -->
                    <div class="flex-title">
                        <h2 style="margin-top: 0">
                            <i class="pi pi-sitemap section-title-icon" />
                            类型
                        </h2>
                        <FloatLabel class="add-input" variant="on">
                            <InputText
                                id="add_genre_label"
                                v-model.trim="addGenreValue"
                                size="small"
                            />
                            <label for="add_genre_label">添加类型</label>
                        </FloatLabel>
                        <SplitButton
                            :model="genreMenuItems"
                            class="add-button"
                            icon="pi pi-plus"
                            severity="secondary"
                            size="small"
                            @click="
                                () => {
                                    if (addGenreValue) {
                                        newVideo.genre.push(addGenreValue)
                                        addGenreValue = ''
                                    }
                                }
                            "
                        />
                    </div>
                    <div style="display: flex">
                        <div class="flex-content" style="flex: 1">
                            <transition-group
                                name="editable-chip"
                                tag="div"
                                class="editable-chip-list"
                            >
                                <div
                                    v-for="(genre, index) in newVideo.genre"
                                    :key="`${normalizeTextValue(genre)}-${index}`"
                                    class="editable-chip-wrapper"
                                >
                                    <Chip
                                        :label="normalizeTextValue(genre)"
                                        class="editable-chip"
                                        removable
                                        remove-icon="pi pi-times"
                                        @remove="
                                            () => {
                                                newVideo.genre = newVideo.genre.filter(
                                                    (_, i) => i !== index
                                                )
                                            }
                                        "
                                    />
                                </div>
                            </transition-group>
                        </div>
                        <Button
                            v-tooltip="'搜索'"
                            :disabled="isScraperRunning"
                            icon="pi pi-search"
                            variant="outlined"
                            style="margin-left: 0.5rem; height: fit-content"
                            @click="runScraperField('parseGenre')"
                        />
                    </div>

                    <h2>
                        <i class="pi pi-chart-bar section-title-icon" />
                        数据
                    </h2>
                    <div class="flex-input">
                        <FloatLabel v-tooltip.top="'如JP-18+'" variant="on" style="display: flex">
                            <InputText
                                id="mpaa_label"
                                v-model.trim="newVideo.mpaa"
                                style="flex: 1"
                            />
                            <label for="mpaa_label">分级</label>
                            <Button
                                v-tooltip="'搜索'"
                                :disabled="isScraperRunning"
                                icon="pi pi-search"
                                variant="outlined"
                                style="margin-left: 0.5rem; height: fit-content"
                                @click="runScraperField('parseMpaa')"
                            />
                        </FloatLabel>

                        <FloatLabel
                            v-tooltip.top="'以10分为满分'"
                            variant="on"
                            style="display: flex"
                        >
                            <InputText
                                id="rating_label"
                                v-model.trim="newVideo.rating"
                                :invalid="newVideo.rating ? !isNumeric(newVideo.rating) : false"
                                style="flex: 1"
                            />
                            <label for="rating_label">评分</label>
                            <Button
                                v-tooltip="'搜索'"
                                :disabled="isScraperRunning"
                                icon="pi pi-search"
                                variant="outlined"
                                style="margin-left: 0.5rem; height: fit-content"
                                @click="runScraperField('parseRating')"
                            />
                        </FloatLabel>
                    </div>

                    <h2>
                        <i class="pi pi-send section-title-icon" />
                        发行
                    </h2>
                    <div class="flex-input">
                        <FloatLabel variant="on" style="display: flex">
                            <InputText
                                id="mpaa_label"
                                v-model.trim="newVideo.studio"
                                style="flex: 1"
                            />
                            <label for="mpaa_label">发行商</label>
                            <Button
                                v-tooltip="'搜索'"
                                :disabled="isScraperRunning"
                                icon="pi pi-search"
                                variant="outlined"
                                style="margin-left: 0.5rem; height: fit-content"
                                @click="runScraperField('parseStudio')"
                            />
                        </FloatLabel>

                        <FloatLabel variant="on" style="display: flex">
                            <InputText
                                id="rating_label"
                                v-model.trim="newVideo.maker"
                                style="flex: 1"
                            />
                            <label for="rating_label">制片商</label>
                            <Button
                                v-tooltip="'搜索'"
                                :disabled="isScraperRunning"
                                icon="pi pi-search"
                                variant="outlined"
                                style="margin-left: 0.5rem; height: fit-content"
                                @click="runScraperField('parseMaker')"
                            />
                        </FloatLabel>
                    </div>

                    <div class="flex-input">
                        <FloatLabel variant="on" style="display: flex">
                            <InputText
                                id="year_label"
                                v-model.trim="newVideo.year"
                                style="flex: 1"
                                :invalid="newVideo.year ? !isNumeric(newVideo.year, false) : false"
                            />
                            <label for="year_label">发行年份</label>
                            <Button
                                v-tooltip="'搜索'"
                                :disabled="isScraperRunning"
                                icon="pi pi-search"
                                variant="outlined"
                                style="margin-left: 0.5rem; height: fit-content"
                                @click="runScraperField('parseYear')"
                            />
                        </FloatLabel>

                        <FloatLabel
                            v-tooltip.top="'时间格式为 2025-01-01'"
                            variant="on"
                            style="display: flex"
                        >
                            <InputText
                                id="mpaa_label"
                                v-model.trim="newVideo.releasedate"
                                style="flex: 1"
                                :invalid="
                                    newVideo.releasedate
                                        ? !isValidDate(newVideo.releasedate)
                                        : false
                                "
                                @change="
                                    () => {
                                        newVideo.premiered = newVideo.releasedate
                                    }
                                "
                            />
                            <label for="mpaa_label">上映日期</label>
                            <Button
                                v-tooltip="'搜索'"
                                :disabled="isScraperRunning"
                                icon="pi pi-search"
                                variant="outlined"
                                style="margin-left: 0.5rem; height: fit-content"
                                @click="runScraperField('parseReleasedate')"
                            />
                        </FloatLabel>
                    </div>
                </div>
                <!-- #endregion 编辑部分 -->

                <!-- 图片编辑部分 -->
                <ImageEditor
                    v-show="activeTab === 'image'"
                    v-model:video="newVideo"
                    v-model:preview-image="previewImage"
                    :buttondisable="isScraperRunning"
                    :scraper-field="runScraperField"
                />

                <!-- #region 视频信息部分 -->
                <div v-show="activeTab === 'info'">
                    <!-- 文件信息列表 -->
                    <div class="info-list">
                        <div class="info-item">
                            <Tag value="文件名"></Tag>
                            <span class="info-value">{{
                                `${video.fileName}${video.extname}`
                            }}</span>
                        </div>
                        <div class="info-item">
                            <Tag value="路径"></Tag>
                            <span class="info-value">{{ video.path.toString() }}</span>
                        </div>

                        <div class="info-item">
                            <Tag value="文件大小"></Tag>
                            <span class="info-value">{{ formatFileSize(video.size) }}</span>
                        </div>
                        <div class="info-item">
                            <Tag value="加入时间"></Tag>
                            <span class="info-value">{{ formatVideoTime(video.joinTime) }}</span>
                        </div>
                        <div class="info-item">
                            <Tag value="编辑时间"></Tag>
                            <span class="info-value">{{ formatVideoTime(video.changeTime) }}</span>
                        </div>
                    </div>

                    <!-- 文件操作 -->
                    <div style="display: flex; gap: 0.5rem">
                        <Button
                            icon="pi pi-play-circle"
                            label="播放"
                            size="small"
                            @click="openVideoPath"
                        />
                        <Button
                            icon="pi pi-folder-open"
                            label="打开文件夹"
                            severity="secondary"
                            size="small"
                            @click="openVideoDir"
                        />
                    </div>
                </div>
                <!-- #endregion 视频信息部分 -->
            </div>
        </Scroll>

        <!-- 底部 -->
        <div class="footer">
            <Button
                icon="pi pi-times"
                label="取消"
                severity="secondary"
                size="small"
                @click="dialogRef.close()"
            />
            <Button
                :loading="isSaving"
                :disabled="isEditeScraperRunning"
                icon="pi pi-save"
                label="保存"
                size="small"
                @click="onSave"
            />
        </div>
    </div>
</template>

<style lang="scss" scoped>
.manage-view-editor {
    width: 70vw;
    min-width: 30rem;
    max-width: 70rem;
    display: flex;
    flex-direction: column;

    .scraper-progress {
        height: 4px;
        border-radius: 0;
        position: absolute;
        top: -1px;
        left: 0;
        width: 100%;
        background-color: transparent;

        :deep(.p-progressbar-value) {
            background: var(--p-primary-color);
        }
    }

    .form-container {
        --spacing: 1.25rem;

        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 1rem;

        .flex-title {
            display: flex;
            flex-direction: row;
            align-items: flex-end;
            margin-top: var(--spacing);
            gap: 0.5rem;
        }

        .flex-content {
            display: flex;
            flex-direction: row;
            align-items: center;
            flex-wrap: wrap;
            gap: 1rem;
        }

        .flex-input {
            display: flex;
            flex-direction: row;
            gap: 1rem;

            > * {
                flex: 1;
            }
        }

        h2 {
            font-size: 1.2rem;
            font-weight: bold;
            margin: initial;
            margin-top: var(--spacing);
            padding-left: 0.5rem;
            color: var(--p-pink-600);
            margin-right: auto;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .section-title-icon {
            font-size: 1.25rem;
        }

        .add-input {
            --p-inputtext-sm-font-size: 0.8rem;

            width: 8rem;
            height: 1.5rem;
            font-size: var(--p-inputtext-sm-font-size);

            input {
                height: 100%;
            }
        }

        .add-button {
            --p-button-sm-padding-x: 2px;
            --p-button-sm-font-size: 0.8rem;

            width: 3rem;
            height: 1.5rem;

            :deep(svg) {
                font-size: var(--p-button-sm-font-size);
            }
        }

        .editable-chip-list {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
        }

        .editable-chip-wrapper {
            display: inline-flex;
        }

        .editable-chip-move,
        .editable-chip-enter-active,
        .editable-chip-leave-active {
            transition:
                transform 0.25s ease-out,
                opacity 0.25s ease-out;
        }

        .editable-chip-enter-from,
        .editable-chip-leave-to {
            opacity: 0;
            transform: translateY(-8px) scale(0.9);
        }

        .editable-chip-leave-active {
            position: absolute;
            pointer-events: none;
        }

        .editable-chip {
            :deep(.p-chip-remove-icon) {
                font-size: 0.8rem;
            }

            :deep(.p-chip-remove-icon:hover) {
                color: var(--p-primary-color);
            }
        }
    }

    //顶部标签部分
    .header {
        justify-content: flex-start;
        position: relative;

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
        padding: 1rem;
    }
}

input {
    width: 100%;
}

.info-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-bottom: 3rem;

    .info-item {
        .info-value {
            margin-left: 0.5rem;
            user-select: text;
        }
    }
}
</style>
