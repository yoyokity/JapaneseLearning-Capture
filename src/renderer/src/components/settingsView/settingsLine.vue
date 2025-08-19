<script lang="ts" setup>
import { nextTick, onMounted, ref } from 'vue'

/**
 * 设置项组件属性
 */
interface IProps {
	/**
	 * 图标类名
	 */
	icon?: string
	/**
	 * 标题
	 */
	title: string
	/**
	 * 描述文本
	 */
	description?: string
	/**
	 * 是否可折叠
	 */
	collapsible?: boolean
	/**
	 * 初始状态是否展开
	 */
	defaultOpen?: boolean
	/**
	 * 是否禁用
	 */
	disable?: boolean
}

const props = withDefaults(defineProps<IProps>(), {
	icon: '',
	description: '',
	collapsible: false,
	defaultOpen: false,
	disable: false
})

// 定义事件
const emit = defineEmits(['open', 'close'])

// 折叠状态
const isOpen = ref(props.defaultOpen)
// 内容高度
const contentHeight = ref('0')
// 内容元素引用
const contentRef = ref<HTMLElement | null>(null)

/**
 * 计算子项数量
 */
function countItems(): number {
	if (!contentRef.value) return 0

	// 查找所有line-item-options-item类的元素
	const items = contentRef.value.querySelectorAll('.line-item-options-item')
	return items.length
}

/**
 * 更新内容高度
 */
function updateContentHeight() {
	if (isOpen.value) {
		// 计算子项数量
		const itemCount = countItems()

		if (itemCount > 0) {
			// 每个子项高度3rem，加上额外的1rem空间
			contentHeight.value = `${itemCount * 3 + 1}rem`
		} else if (contentRef.value) {
			// 如果没有找到子项，但有内容元素，使用其实际高度
			nextTick(() => {
				const el = contentRef.value
				if (el) {
					// 临时设置为auto来获取实际高度
					el.style.height = 'auto'
					const height = el.scrollHeight

					// 设置实际高度
					contentHeight.value = `${height}px`
				} else {
					// 默认高度
					contentHeight.value = '9.5rem'
				}
			})
		} else {
			// 默认高度
			contentHeight.value = '9.5rem'
		}
	} else {
		contentHeight.value = '0'
	}
}

/**
 * 打开折叠内容
 */
function open() {
	if (props.collapsible && !props.disable && !isOpen.value) {
		isOpen.value = true
		updateContentHeight()
		emit('open')
	}
}

/**
 * 关闭折叠内容
 */
function close() {
	if (props.collapsible && !props.disable && isOpen.value) {
		isOpen.value = false
		updateContentHeight()
		emit('close')
	}
}

/**
 * 切换折叠状态
 */
function toggle() {
	if (props.collapsible && !props.disable) {
		if (isOpen.value) {
			close()
		} else {
			open()
		}
	}
}

// 组件挂载后初始化
onMounted(() => {
	if (props.collapsible && isOpen.value) {
		nextTick(() => {
			updateContentHeight()
		})
	}
})

// 暴露组件状态和方法
defineExpose({
	isOpen,
	open,
	close,
	toggle
})
</script>

<template>
	<div :class="{ clickable: collapsible, disabled: disable }" class="line-item">
		<!-- 普通设置项 -->
		<template v-if="!collapsible">
			<i :class="icon"></i>
			<div class="line-item-content">
				<h2>{{ title }}</h2>
				<p v-if="description">{{ description }}</p>
			</div>
			<div class="line-item-right">
				<slot name="right"></slot>
			</div>
		</template>

		<!-- 可折叠设置项 -->
		<template v-else>
			<div
				:style="{
					borderBottom: isOpen
						? '1px solid var(--p-surface-300)'
						: '1px solid transparent'
				}"
				class="clickable-header"
				@click="toggle()"
			>
				<i :class="icon"></i>
				<div class="line-item-content">
					<h2>{{ title }}</h2>
					<p v-if="description">{{ description }}</p>
				</div>
				<div class="line-item-right">
					<slot name="header-right"></slot>
					<i
						:style="{
							transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)'
						}"
						class="pi pi-angle-down"
					/>
				</div>
			</div>
			<div
				ref="contentRef"
				:style="{
					height: contentHeight
				}"
				class="line-item-options"
			>
				<div style="height: 0.5rem"></div>
				<slot></slot>
			</div>
		</template>
	</div>
</template>

<style lang="scss" scoped>
.line-item {
	width: 100%;
	height: 4rem;
	background-color: var(--p-surface-100);
	border-radius: var(--border-radius);
	border: var(--separator);
	margin-top: 0.5rem;
	display: flex;
	align-items: center;
	transition: all 0.3s var(--animation-type);
	overflow: hidden;

	i {
		width: 3rem;
		font-size: 1.25rem;
		margin-left: 0.5rem;
		display: flex;
		justify-content: center;
	}

	.line-item-content {
		display: flex;
		flex-direction: column;
	}

	h2 {
		margin: initial;
		font-weight: normal;
		font-size: 1rem;
		height: 1.5rem;
	}

	p {
		margin: initial;
		font-size: 0.75rem;
		height: 1rem;
		color: var(--p-text-muted-color);
	}

	.line-item-right {
		margin-left: auto;
		margin-right: 0.7rem;
		height: 100%;
		display: flex;
		justify-content: flex-end;
		align-items: center;
		gap: 1rem;
	}

	&.clickable {
		flex-direction: column;
		height: auto;

		.clickable-header {
			display: flex;
			align-items: center;
			width: 100%;
			height: 4rem;
			cursor: pointer;
			transition: all 0.3s var(--animation-type);

			&:hover {
				background-color: var(--p-surface-200);
			}
		}

		.line-item-right i {
			color: var(--p-surface-400);
			font-size: var(--p-icon-size);
			transition: transform 0.3s var(--animation-type);
		}

		.line-item-options {
			width: 100%;
			overflow: hidden;
			transition: height 0.3s var(--animation-type);
			padding: 0 0.7rem 0 3.5rem;
		}
	}

	&.disabled {
		opacity: 0.6;
		cursor: initial;

		.clickable-header {
			cursor: initial;

			&:hover {
				background-color: var(--p-surface-100);
			}
		}
	}
}
</style>
