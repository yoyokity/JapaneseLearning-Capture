<script setup lang="ts">
import { provide } from 'vue'
import { IDialog } from './type'

const visible = defineModel('visible', {
	type: Boolean
})

const emit = defineEmits<{
	close: any
}>()

const dialog: IDialog = {
	/**
	 * 关闭对话框
	 * @param data 关闭时传递的数据
	 */
	close: (data?: any) => {
		visible.value = false
		emit('close', data)
	}
}

provide('dialog', dialog)
</script>

<template>
	<Teleport to="body">
		<Transition mode="out-in" name="dialog">
			<div class="dialog" v-if="visible">
				<div class="dialog-content">
					<slot></slot>
				</div>
			</div>
		</Transition>
	</Teleport>
</template>

<style lang="scss" scoped>
.dialog {
	position: fixed;
	top: 0;
	left: 0;
	width: 100vw;
	height: 100vh;
	background-color: var(--p-mask-background);
	display: flex;
	justify-content: center;
	align-items: center;
	z-index: 1101;
}

.dialog-content {
	min-width: 20rem;
	min-height: 15rem;
	overflow: hidden;

	border-radius: var(--p-dialog-border-radius);
	box-shadow: var(--p-dialog-shadow);
	background: var(--p-dialog-background);
	border: 1px solid var(--p-dialog-border-color);
	color: var(--p-dialog-color);
}

//内部元素
:deep(.header) {
	height: var(--header-height);
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 0 calc(var(--dialog-padding-x) / 2);
	border-bottom: var(--separator);

	h1 {
		font-size: 1.25rem;
	}
}

:deep(.content){
	padding: var(--p-dialog-content-padding);
}

//动画效果
.dialog-enter-active,
.dialog-leave-active {
	transition: opacity var(--p-mask-transition-duration) ease;
}

.dialog-enter-from,
.dialog-leave-to {
	opacity: 0;
}

.dialog-enter-to,
.dialog-leave-from {
	opacity: 1;
}
</style>
