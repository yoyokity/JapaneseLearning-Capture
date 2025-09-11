<script lang="ts" setup>
import { cloneDeep } from 'es-toolkit/object'
import { inject, onMounted, ref, Ref } from 'vue'
import FloatLabel from 'primevue/floatlabel'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Chip from 'primevue/chip'
import Button from 'primevue/button'
import SplitButton from 'primevue/splitbutton'
import { IVideoFile } from './type'
import { IActor } from '@renderer/scraper'
import useKeyPress from 'vue-hooks-plus/es/useKeyPress'
import VideoImage from '@renderer/components/control/videoImage.vue'
import { Path, PathHelper } from '@renderer/helper'

const dialogRef = inject('dialogRef') as Ref<any>
const video = ref<IVideoFile>({} as IVideoFile)

const imageLabels = {
	poster: '封面',
	fanart: '背景',
	thumb: '缩略图'
}
const previewImage = ref<Path | null>(null)

const tabs = [
	{ id: 'info', name: '信息', icon: 'pi pi-info-circle' },
	{ id: 'image', name: '图片', icon: 'pi pi-image' }
]
const activeTab = ref('info')
function switchTab(tabId: string) {
	if (tabId === activeTab.value) return
	activeTab.value = tabId
}

const addActorValue = ref<IActor>({
	name: '',
	role: '',
	imgUrl: ''
})
const addTagValue = ref('')
const addGenreValue = ref('')

function close(data: any = null) {
	if (data) {
		dialogRef.value.close(data)
	} else {
		dialogRef.value.close()
	}
}

//快捷键退出
useKeyPress(['esc', 'backspace'], () => {
	close()
})

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
					video.value.tag.push(inputRef.value)
					video.value.genre.push(inputRef.value)
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
 * 处理文件拖放事件
 * @param e 拖放事件
 * @param imageType 图片类型（poster、fanart、thumb）
 */
async function handleDrop(e: DragEvent, imageType: 'poster' | 'fanart' | 'thumb') {
	e.preventDefault()

	// 确保拖放结束后移除dragover样式
	if (e.currentTarget instanceof HTMLElement) {
		e.currentTarget.classList.remove('dragover')
	}

	if (!e.dataTransfer?.files?.length) return

	const file = e.dataTransfer.files[0]
	const filePath = await PathHelper.getPathForFile(file)

	// 更新对应类型的图片路径
	if (filePath) {
		video.value[imageType] = new Path(filePath)
	}
}

/**
 * 处理拖动事件
 * @param e 拖动事件
 * @param action 动作类型：'enter'、'leave'或'over'
 */
function handleDrag(e: DragEvent, action: 'enter' | 'leave' | 'over') {
	e.preventDefault()

	if (e.currentTarget instanceof HTMLElement) {
		if (action === 'enter') {
			e.currentTarget.classList.add('dragover')
		} else if (action === 'leave') {
			// 确保只有当鼠标真正离开元素时才移除dragover样式
			if (!e.currentTarget.contains(e.relatedTarget as Node)) {
				e.currentTarget.classList.remove('dragover')
			}
		}
	}
}

onMounted(() => {
	const params = dialogRef.value.data // {video: IVideoFile}
	video.value = cloneDeep(params.video) // 深拷贝，避免响应式对象引用问题
})
</script>

<template>
	<div class="manage-view-editor">
		<!-- 顶部标签部分 -->
		<div class="manage-view-editor-header">
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
			<div
				:style="{
					transform: `translateX(${tabs.findIndex((tab) => tab.id === activeTab) * 5 + 0.5}rem)`
				}"
				class="active-indicator"
			></div>
		</div>

		<!-- 信息编辑部分 -->
		<div v-show="activeTab === 'info'" class="form-container">
			<h2 style="margin-top: 0">标题</h2>
			<FloatLabel variant="on">
				<InputText id="title_label" v-model.trim="video.title" />
				<label for="title_label">标题</label>
			</FloatLabel>

			<FloatLabel v-tooltip="'原始标题，jellyfin中会显示在大标题下方作为小标题'" variant="on">
				<InputText id="original_title_label" v-model.trim="video.originaltitle" />
				<label for="original_title_label">原标题</label>
			</FloatLabel>

			<FloatLabel v-tooltip="'名称排序时会以此为标准'" variant="on">
				<InputText id="sort_title_label" v-model.trim="video.sorttitle" />
				<label for="sort_title_label">排序标题</label>
			</FloatLabel>

			<FloatLabel variant="on">
				<InputText id="sort_title_label" v-model.trim="video.set" />
				<label for="sort_title_label">影片系列</label>
			</FloatLabel>

			<h2>介绍</h2>
			<FloatLabel variant="on">
				<Textarea
					id="plot_label"
					v-model.trim="video.plot"
					autoResize
					rows="5"
					style="width: 100%"
				/>
				<label for="plot_label">内容简介</label>
			</FloatLabel>

			<FloatLabel variant="on">
				<InputText id="tagline_label" v-model.trim="video.tagline" />
				<label for="tagline_label">宣传词</label>
			</FloatLabel>

			<h2>人员</h2>
			<FloatLabel variant="on">
				<InputText id="director_label" v-model.trim="video.director" />
				<label for="director_label">导演</label>
			</FloatLabel>

			<!-- 演员 -->
			<div v-for="actor in video.actor" class="flex-input">
				<FloatLabel variant="on">
					<InputText id="mpaa_label" v-model.trim="actor.name" />
					<label for="mpaa_label">演员</label>
				</FloatLabel>

				<FloatLabel variant="on">
					<InputText id="mpaa_label" v-model.trim="actor.role" />
					<label for="mpaa_label">扮演角色</label>
				</FloatLabel>

				<FloatLabel style="flex: 2" variant="on">
					<InputText id="rating_label" v-model.trim="actor.imgUrl" />
					<label for="rating_label">图像链接</label>
				</FloatLabel>

				<Button
					v-tooltip="'删除演员'"
					icon="pi pi-trash"
					severity="secondary"
					style="flex: none"
					@click="
						() => {
							video.actor = video.actor.filter((a) => a !== actor)
						}
					"
				/>
			</div>
			<!-- 添加演员 -->
			<div class="flex-input">
				<FloatLabel variant="on">
					<InputText id="mpaa_label" v-model.trim="addActorValue.name" />
					<label for="mpaa_label">演员</label>
				</FloatLabel>

				<FloatLabel variant="on">
					<InputText id="mpaa_label" v-model.trim="addActorValue.role" />
					<label for="mpaa_label">扮演角色</label>
				</FloatLabel>

				<FloatLabel style="flex: 2" variant="on">
					<InputText id="rating_label" v-model.trim="addActorValue.imgUrl" />
					<label for="rating_label">图像链接</label>
				</FloatLabel>

				<Button
					v-tooltip="'添加演员'"
					icon="pi pi-plus"
					severity="secondary"
					style="flex: none"
					@click="
						() => {
							if (!addActorValue.name) return
							// 创建新对象副本，避免响应式对象引用问题
							video.actor.push({
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
								video.tag.push(addTagValue)
								addTagValue = ''
							}
						}
					"
				/>
			</div>
			<div class="flex-content">
				<Chip
					v-for="tag in video.tag"
					:key="tag"
					:label="tag"
					removable
					@remove="
						() => {
							video.tag = video.tag.filter((t) => t !== tag)
						}
					"
				/>
			</div>

			<!-- 类型 -->
			<div class="flex-title">
				<h2 style="margin-top: 0">类型</h2>
				<FloatLabel class="add-input" variant="on">
					<InputText id="add_genre_label" v-model.trim="addGenreValue" size="small" />
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
								video.genre.push(addGenreValue)
								addGenreValue = ''
							}
						}
					"
				/>
			</div>
			<div class="flex-content">
				<Chip
					v-for="genre in video.genre"
					:key="genre"
					:label="genre"
					removable
					@remove="
						() => {
							video.genre = video.genre.filter((g) => g !== genre)
						}
					"
				/>
			</div>

			<h2>数据</h2>
			<FloatLabel v-tooltip="'如番号、网站-编号'" variant="on">
				<InputText id="num_label" v-model.trim="video.num" />
				<label for="num_label">编号</label>
			</FloatLabel>

			<div class="flex-input">
				<FloatLabel v-tooltip="'如JP-18+'" variant="on">
					<InputText id="mpaa_label" v-model.trim="video.mpaa" />
					<label for="mpaa_label">分级</label>
				</FloatLabel>

				<FloatLabel v-tooltip="'以10分为满分'" variant="on">
					<InputText id="rating_label" v-model.trim="video.rating" />
					<label for="rating_label">评分</label>
				</FloatLabel>
			</div>

			<h2>发行</h2>
			<div class="flex-input">
				<FloatLabel variant="on">
					<InputText id="mpaa_label" v-model.trim="video.studio" />
					<label for="mpaa_label">发行商</label>
				</FloatLabel>

				<FloatLabel variant="on">
					<InputText id="rating_label" v-model.trim="video.maker" />
					<label for="rating_label">制片商</label>
				</FloatLabel>
			</div>

			<div class="flex-input">
				<FloatLabel variant="on">
					<InputText id="year_label" v-model.trim="video.year" />
					<label for="year_label">发行年份</label>
				</FloatLabel>

				<FloatLabel variant="on">
					<InputText
						id="mpaa_label"
						v-model.trim="video.releasedate"
						@change="
							() => {
								video.premiered = video.releasedate
							}
						"
					/>
					<label for="mpaa_label">上映日期</label>
				</FloatLabel>
			</div>
		</div>

		<!-- 图片编辑部分 -->
		<div
			v-show="activeTab === 'image'"
			class="form-container"
			style="
				padding-top: 0.75rem;
				gap: 2rem;
				flex-direction: row;
				flex-wrap: wrap;
				justify-content: center;
			"
		>
			<div v-for="label in Object.keys(imageLabels)" :key="label">
				<h2 style="margin-bottom: 1rem; text-align: center">{{ imageLabels[label] }}</h2>
				<div
					class="image-container"
					@dragover.prevent="(e) => handleDrag(e, 'over')"
					@drop.prevent="(e) => handleDrop(e, label as 'poster' | 'fanart' | 'thumb')"
					@dragenter.prevent="(e) => handleDrag(e, 'enter')"
					@dragleave.prevent="(e) => handleDrag(e, 'leave')"
					@click="previewImage = video[label] as Path"
				>
					<VideoImage
						:filePath="video[label] as Path | null"
						:style="{
							width: 'fit-content',
							minHeight: '15rem',
							maxHeight: '30rem',
							height: '50vh'
						}"
					/>
					<div class="image-overlay">
						<p>拖入图片以更改</p>
						<i class="pi pi-eye"></i>
					</div>
				</div>
			</div>

			<!-- 放大显示 -->
			<Teleport to="body">
				<Transition name="fade" mode="out-in">
					<div
						v-if="previewImage"
						class="preview-image-modal"
						@click="previewImage = null"
					>
						<VideoImage
							:filePath="previewImage as Path"
							borderRadius="none"
							:style="{
								display: 'flex',
								justifyContent: 'center',
								alignItems: 'center',
								width: '90vw',
								height: '90vh'
							}"
							:imageStyle="{
								width: '100%',
								height: '100%',
								objectFit: 'contain'
							}"
						/>
					</div>
				</Transition>
			</Teleport>
		</div>

		<!-- 底部 -->
		<div class="manage-view-editor-footer">
			<Button icon="pi pi-times" label="取消" severity="secondary" @click="close()" />
			<Button icon="pi pi-save" label="保存" @click="close(video)" />
		</div>
	</div>
</template>

<style lang="scss" scoped>
.manage-view-editor {
	width: 50vw;
	min-width: 30rem;
	max-width: 50rem;

	.form-container {
		--spacing: 1.25rem;

		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding-top: 2rem;
		padding-bottom: 1rem;

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

	.manage-view-editor-header {
		padding-left: 0.5rem;
		position: fixed;
		top: 0;
		width: 100%;
		height: var(--header-height);
		transform: translateX(-1.25rem);
	}

	//顶部标签部分
	.manage-view-editor-header {
		display: flex;
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

	.manage-view-editor-footer {
		position: fixed;
		display: flex;
		flex-direction: row;
		justify-content: flex-end;
		gap: 1rem;
		bottom: 0;
		padding: 1rem 0;
		margin-left: auto;
		width: 100%;
		padding-right: 1rem;
		transform: translateX(-1.25rem);
		border-top: var(--separator);
	}

	//图片覆盖层
	.image-container {
		--border-color: var(--p-surface-400);

		cursor: pointer;
		position: relative;
		transition: all 0.3s var(--animation-type);
		border-radius: calc(var(--border-radius) * 2 + 5px);
		overflow: hidden;

		border: 4px dashed var(--border-color);
		padding: 4px;

		.image-overlay {
			position: absolute;
			top: 0;
			left: 0;
			width: 100%;
			height: 100%;
			opacity: 0;
			transition: all 0.3s var(--animation-type);
			background-color: rgba(0, 0, 0, 0.5);
			display: flex;
			justify-content: center;
			align-items: center;
			color: var(--p-primary-inverse-color);

			p {
				position: absolute;
				top: 0;
			}

			i {
				font-size: 3rem;
			}
		}

		&:hover,
		&.dragover {
			.image-overlay {
				opacity: 1;
			}
		}

		&.dragover {
			--border-color: var(--p-primary-color);
		}
	}
}

//放大预览图片
.preview-image-modal {
	position: fixed;
	top: 0;
	left: 0;
	width: 100vw;
	height: 100vh;
	background: color-mix(in srgb, var(--p-surface-900) 80%, transparent);
	color: var(--p-mask-color);
	z-index: 9999;
	display: flex;
	justify-content: center;
	align-items: center;
	backdrop-filter: blur(16px);
}

// 淡入淡出动画
.fade-enter-active,
.fade-leave-active {
	transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
	opacity: 0;
}

.fade-enter-to,
.fade-leave-from {
	opacity: 1;
}

input {
	width: 100%;
}
</style>
