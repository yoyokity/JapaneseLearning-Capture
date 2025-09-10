<script lang="ts" setup>
import { inject, onMounted, ref, Ref } from 'vue'
import FloatLabel from 'primevue/floatlabel'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Chip from 'primevue/chip'
import Button from 'primevue/button'
import SplitButton from 'primevue/splitbutton'
import { IVideoFile } from './type'
import { IActor } from '@renderer/scraper'

const dialogRef = inject('dialogRef') as Ref<any>

const video = ref<IVideoFile>({} as IVideoFile)

const addActorValue = ref<IActor>({
	name: '',
	role: '',
	imgUrl: ''
})
const addTagValue = ref('')
const addGenreValue = ref('')

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

onMounted(() => {
	const params = dialogRef.value.data // {video: IVideoFile}
	video.value = params.video
})
</script>

<template>
	<div class="manage-view-editor">
		<div class="form-container">
			<h2 style="margin-top: 0">标题</h2>
			<FloatLabel variant="on">
				<InputText id="title_label" v-model="video.title" />
				<label for="title_label">标题</label>
			</FloatLabel>

			<FloatLabel v-tooltip="'原始标题，jellyfin中会显示在大标题下方作为小标题'" variant="on">
				<InputText id="original_title_label" v-model="video.originaltitle" />
				<label for="original_title_label">原标题</label>
			</FloatLabel>

			<FloatLabel v-tooltip="'名称排序时会以此为标准'" variant="on">
				<InputText id="sort_title_label" v-model="video.sorttitle" />
				<label for="sort_title_label">排序标题</label>
			</FloatLabel>

			<FloatLabel variant="on">
				<InputText id="sort_title_label" v-model="video.set" />
				<label for="sort_title_label">影片系列</label>
			</FloatLabel>

			<h2>介绍</h2>
			<FloatLabel variant="on">
				<Textarea
					id="plot_label"
					v-model="video.plot"
					autoResize
					rows="5"
					style="width: 100%"
				/>
				<label for="plot_label">内容简介</label>
			</FloatLabel>

			<FloatLabel variant="on">
				<InputText id="tagline_label" v-model="video.tagline" />
				<label for="tagline_label">宣传词</label>
			</FloatLabel>

			<h2>人员</h2>
			<FloatLabel variant="on">
				<InputText id="director_label" v-model="video.director" />
				<label for="director_label">导演</label>
			</FloatLabel>

			<!-- 演员 -->
			<div v-for="actor in video.actor" class="flex-input">
				<FloatLabel variant="on">
					<InputText id="mpaa_label" v-model="actor.name" />
					<label for="mpaa_label">演员</label>
				</FloatLabel>

				<FloatLabel variant="on">
					<InputText id="mpaa_label" v-model="actor.role" />
					<label for="mpaa_label">扮演角色</label>
				</FloatLabel>

				<FloatLabel style="flex: 2" variant="on">
					<InputText id="rating_label" v-model="actor.imgUrl" />
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
					<InputText id="mpaa_label" v-model="addActorValue.name" />
					<label for="mpaa_label">演员</label>
				</FloatLabel>

				<FloatLabel variant="on">
					<InputText id="mpaa_label" v-model="addActorValue.role" />
					<label for="mpaa_label">扮演角色</label>
				</FloatLabel>

				<FloatLabel style="flex: 2" variant="on">
					<InputText id="rating_label" v-model="addActorValue.imgUrl" />
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
					<InputText id="add_tag_label" v-model="addTagValue" size="small" />
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
					<InputText id="add_genre_label" v-model="addGenreValue" size="small" />
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
				<InputText id="num_label" v-model="video.num" />
				<label for="num_label">编号</label>
			</FloatLabel>

			<div class="flex-input">
				<FloatLabel v-tooltip="'如JP-18+'" variant="on">
					<InputText id="mpaa_label" v-model="video.mpaa" />
					<label for="mpaa_label">分级</label>
				</FloatLabel>

				<FloatLabel v-tooltip="'以10分为满分'" variant="on">
					<InputText id="rating_label" v-model="video.rating" />
					<label for="rating_label">评分</label>
				</FloatLabel>
			</div>

			<h2>发行</h2>
			<div class="flex-input">
				<FloatLabel variant="on">
					<InputText id="mpaa_label" v-model="video.studio" />
					<label for="mpaa_label">发行商</label>
				</FloatLabel>

				<FloatLabel variant="on">
					<InputText id="rating_label" v-model="video.maker" />
					<label for="rating_label">制片商</label>
				</FloatLabel>
			</div>

			<div class="flex-input">
				<FloatLabel variant="on">
					<InputText id="year_label" v-model="video.year" />
					<label for="year_label">发行年份</label>
				</FloatLabel>

				<FloatLabel variant="on">
					<InputText
						id="mpaa_label"
						v-model="video.releasedate"
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
}

input {
	width: 100%;
}
</style>
