<script lang="ts" setup>
import type { IActor, IVideoFile } from '@renderer/scraper'
import type { Ref } from 'vue'

import Scroll from '@renderer/components/control/scroll/scroll.vue'
import { DebugHelper, isNumeric, isUrl, isValidDate, PathHelper } from '@renderer/helper'
import { createVideoFile, Scraper } from '@renderer/scraper'
import { isEqual } from 'es-toolkit'
import { cloneDeep } from 'es-toolkit/object'
import Button from 'primevue/button'
import Chip from 'primevue/chip'
import FloatLabel from 'primevue/floatlabel'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import SplitButton from 'primevue/splitbutton'
import Textarea from 'primevue/textarea'
import { inject, onMounted, ref } from 'vue'
import useKeyPress from 'vue-hooks-plus/es/useKeyPress'

import { useMessage } from '../../control/message'
import { readExtrafanart, scanFiles } from '../func'
import { scraperAll, scraperField, scraperSave } from '../func.scraper'
import ImageEditor from './imageEditor.vue'

const dialogRef = inject('dialogRef') as any
const { toast } = useMessage()

const video = dialogRef.value.data.video as IVideoFile

const newVideo = ref<IVideoFile>(createVideoFile(''))
const isSaving = ref(false)

const a = {
    webContent: ref('')
}

//tab部分
const tabs = [
    { id: 'info', name: '信息', icon: 'pi pi-info-circle' },
    { id: 'image', name: '图片', icon: 'pi pi-image' }
]
const activeTab = ref('info')
function switchTab(tabId: string) {
    if (tabId === activeTab.value) return
    activeTab.value = tabId
}

//变量
const addActorValue = ref<IActor>({
    name: '',
    role: '',
    imgUrl: ''
})
const addTagValue = ref('')
const addGenreValue = ref('')

//预览图片
const previewImage = ref<ArrayBuffer | null>(null)

//快捷键退出
useKeyPress(['esc'], () => {
    if (previewImage.value) {
        previewImage.value = null
    } else {
        DebugHelper.queueClear('scraper')
        dialogRef.value.close()
    }
})

/**
 * 保存逻辑
 */
async function onSave() {
    const sourceVideoFile = video
    const scraper = Scraper.getCurrentScraperInstance()

    if (!scraper) return

    DebugHelper.queueWithInterval('scraper', 0, true, async () => {
        //如果视频没有修改，则不保存
        if (isEqual(newVideo.value, sourceVideoFile)) {
            toast.success('未修改，无需保存')
            dialogRef.value.close()
            return
        }

        if (isSaving.value) return
        isSaving.value = true

        //保存
        const re = await scraperSave(newVideo.value, sourceVideoFile, a.webContent, toast)
        if (!re) {
            toast.error('保存失败！')
            isSaving.value = false
            return
        }

        //删除空文件夹
        await PathHelper.removeEmptyFolders(Scraper.getCurrentScraperPath())

        //重新扫描文件
        await scanFiles(toast)

        toast.success('保存成功！')

        isSaving.value = false
        dialogRef.value.close(newVideo.value)
        DebugHelper.queueClear('scraper')
    })
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

onMounted(async () => {
    DebugHelper.queueWithInterval('scraper', 0, true, async () => {
        newVideo.value = cloneDeep(video) // 深拷贝，避免响应式对象引用问题

        //读取extrafanart
        readExtrafanart(video.dir, newVideo.value, video).then((count) => {
            console.info(`读取${count}个extrafanart`)
        })
    })
})
</script>

<template>
    <div class="manage-view-editor">
        <!-- 顶部标签部分 -->
        <div class="header">
            <div
                v-for="tab in tabs"
                :key="tab.id"
                :class="{ active: activeTab === tab.id }"
                :title="tab.name"
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
        </div>
        <Scroll style="height: calc(90vh - var(--header-height) - var(--header-height))">
            <div class="content">
                <!-- 信息编辑部分 -->
                <div v-show="activeTab === 'info'" class="form-container">
                    <h2 style="margin-top: 0">刮削器</h2>
                    <div style="display: flex">
                        <Select
                            v-model="newVideo.scraperName"
                            v-tooltip.top="'选择刮削器'"
                            :options="Scraper.instances.map((scraper) => scraper.scraperName)"
                            style="flex: 1"
                        />
                        <Button
                            v-tooltip="'刮削全部信息'"
                            icon="pi pi-search"
                            variant="outlined"
                            style="margin-left: 0.5rem; height: fit-content"
                            @click="scraperAll(newVideo, a.webContent, toast)"
                        />
                    </div>

                    <h2>编号</h2>
                    <FloatLabel
                        v-for="value in Scraper.getScraperInstance(newVideo.scraperName)?.numSource"
                        :key="value"
                        v-tooltip.top="
                            '作品在刮削网站的编号。刮削搜索时，如果有编号则直接使用编号，否则使用原标题。'
                        "
                        variant="on"
                        style="display: flex"
                    >
                        <InputText id="title_num" v-model.trim="newVideo.num[value]" />
                        <label for="title_num">{{ value }}</label>
                    </FloatLabel>

                    <h2>标题</h2>
                    <FloatLabel variant="on" style="display: flex">
                        <InputText id="title_label" v-model.trim="newVideo.title" />
                        <label for="title_label">标题</label>
                        <Button
                            v-tooltip="'搜索'"
                            icon="pi pi-search"
                            variant="outlined"
                            style="margin-left: 0.5rem"
                            @click="
                                scraperField(newVideo, a.webContent, toast, 'parseTitle', '标题')
                            "
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
                            icon="pi pi-search"
                            variant="outlined"
                            style="margin-left: 0.5rem"
                            @click="
                                scraperField(
                                    newVideo,
                                    a.webContent,
                                    toast,
                                    'parseOriginaltitle',
                                    '原标题'
                                )
                            "
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
                            icon="pi pi-search"
                            variant="outlined"
                            style="margin-left: 0.5rem"
                            @click="
                                scraperField(
                                    newVideo,
                                    a.webContent,
                                    toast,
                                    'parseSorttitle',
                                    '排序标题'
                                )
                            "
                        />
                    </FloatLabel>

                    <FloatLabel variant="on" style="display: flex">
                        <InputText id="sort_title_label" v-model.trim="newVideo.set" />
                        <label for="sort_title_label">影片系列</label>
                        <Button
                            v-tooltip="'搜索'"
                            icon="pi pi-search"
                            variant="outlined"
                            style="margin-left: 0.5rem"
                            @click="
                                scraperField(newVideo, a.webContent, toast, 'parseSet', '影片系列')
                            "
                        />
                    </FloatLabel>

                    <h2>介绍</h2>
                    <FloatLabel variant="on" style="display: flex">
                        <Textarea
                            id="plot_label"
                            v-model.trim="newVideo.plot"
                            auto-resize
                            rows="5"
                            style="width: 100%"
                        />
                        <label for="plot_label">内容简介</label>
                        <Button
                            v-tooltip="'搜索'"
                            icon="pi pi-search"
                            variant="outlined"
                            style="margin-left: 0.5rem; height: fit-content"
                            @click="
                                scraperField(newVideo, a.webContent, toast, 'parsePlot', '内容简介')
                            "
                        />
                    </FloatLabel>

                    <FloatLabel variant="on" style="display: flex">
                        <InputText id="tagline_label" v-model.trim="newVideo.tagline" />
                        <label for="tagline_label">宣传词</label>
                        <Button
                            v-tooltip="'搜索'"
                            icon="pi pi-search"
                            variant="outlined"
                            style="margin-left: 0.5rem; height: fit-content"
                            @click="
                                scraperField(
                                    newVideo,
                                    a.webContent,
                                    toast,
                                    'parseTagline',
                                    '宣传词'
                                )
                            "
                        />
                    </FloatLabel>

                    <h2>人员</h2>
                    <FloatLabel variant="on" style="display: flex">
                        <InputText id="director_label" v-model.trim="newVideo.director" />
                        <label for="director_label">导演</label>
                        <Button
                            v-tooltip="'搜索'"
                            icon="pi pi-search"
                            variant="outlined"
                            style="margin-left: 0.5rem"
                            @click="
                                scraperField(newVideo, a.webContent, toast, 'parseDirector', '导演')
                            "
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
                            icon="pi pi-search"
                            variant="outlined"
                            style="margin-left: 0.5rem; height: fit-content"
                            @click="
                                scraperField(newVideo, a.webContent, toast, 'parseActor', '演员')
                            "
                        />
                    </div>

                    <!-- 标签 -->
                    <div class="flex-title">
                        <h2 style="margin-top: 0">标签</h2>
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
                            <Chip
                                v-for="tag in newVideo.tag"
                                :key="tag"
                                :label="tag"
                                removable
                                @remove="
                                    () => {
                                        newVideo.tag = newVideo.tag.filter((t) => t !== tag)
                                    }
                                "
                            />
                        </div>
                        <Button
                            v-tooltip="'搜索'"
                            icon="pi pi-search"
                            variant="outlined"
                            style="margin-left: 0.5rem; height: fit-content"
                            @click="scraperField(newVideo, a.webContent, toast, 'parseTag', '标签')"
                        />
                    </div>

                    <!-- 类型 -->
                    <div class="flex-title">
                        <h2 style="margin-top: 0">类型</h2>
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
                            <Chip
                                v-for="genre in newVideo.genre"
                                :key="genre"
                                :label="genre"
                                removable
                                @remove="
                                    () => {
                                        newVideo.genre = newVideo.genre.filter((g) => g !== genre)
                                    }
                                "
                            />
                        </div>
                        <Button
                            v-tooltip="'搜索'"
                            icon="pi pi-search"
                            variant="outlined"
                            style="margin-left: 0.5rem; height: fit-content"
                            @click="
                                scraperField(newVideo, a.webContent, toast, 'parseGenre', '类型')
                            "
                        />
                    </div>

                    <h2>数据</h2>
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
                                icon="pi pi-search"
                                variant="outlined"
                                style="margin-left: 0.5rem; height: fit-content"
                                @click="
                                    scraperField(newVideo, a.webContent, toast, 'parseMpaa', '分级')
                                "
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
                                icon="pi pi-search"
                                variant="outlined"
                                style="margin-left: 0.5rem; height: fit-content"
                                @click="
                                    scraperField(
                                        newVideo,
                                        a.webContent,
                                        toast,
                                        'parseRating',
                                        '评分'
                                    )
                                "
                            />
                        </FloatLabel>
                    </div>

                    <h2>发行</h2>
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
                                icon="pi pi-search"
                                variant="outlined"
                                style="margin-left: 0.5rem; height: fit-content"
                                @click="
                                    scraperField(
                                        newVideo,
                                        a.webContent,
                                        toast,
                                        'parseStudio',
                                        '发行商'
                                    )
                                "
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
                                icon="pi pi-search"
                                variant="outlined"
                                style="margin-left: 0.5rem; height: fit-content"
                                @click="
                                    scraperField(
                                        newVideo,
                                        a.webContent,
                                        toast,
                                        'parseMaker',
                                        '制片商'
                                    )
                                "
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
                                icon="pi pi-search"
                                variant="outlined"
                                style="margin-left: 0.5rem; height: fit-content"
                                @click="
                                    scraperField(
                                        newVideo,
                                        a.webContent,
                                        toast,
                                        'parseYear',
                                        '发行年份'
                                    )
                                "
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
                                icon="pi pi-search"
                                variant="outlined"
                                style="margin-left: 0.5rem; height: fit-content"
                                @click="
                                    scraperField(
                                        newVideo,
                                        a.webContent,
                                        toast,
                                        'parseReleasedate',
                                        '上映日期'
                                    )
                                "
                            />
                        </FloatLabel>
                    </div>
                </div>

                <!-- 图片编辑部分 -->
                <ImageEditor
                    v-show="activeTab === 'image'"
                    v-model:video="newVideo"
                    v-model:preview-image="previewImage"
                    :web-content="a.webContent"
                />
            </div>
        </Scroll>

        <!-- 底部 -->
        <div class="manage-view-editor-footer">
            <Button
                icon="pi pi-times"
                label="取消"
                severity="secondary"
                size="small"
                @click="dialogRef.close()"
            />
            <Button
                :loading="isSaving"
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
            color: var(--p-primary-color);
            margin-right: auto;
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

    .manage-view-editor-footer {
        display: flex;
        flex-direction: row;
        justify-content: flex-end;
        gap: 1rem;
        padding: 1rem 0;
        margin-left: auto;
        width: 100%;
        height: var(--header-height);
        padding-right: 1rem;
        border-top: var(--separator);
    }
}

input {
    width: 100%;
}
</style>
