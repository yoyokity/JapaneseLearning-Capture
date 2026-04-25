import type { DirectiveBinding } from 'vue'

import Tooltip from 'primevue/tooltip'

// 1. 定义你的统一配置
const GLOBAL_TOOLTIP_CONFIG = {
    showDelay: 400, // 你想要的统一显示延迟
    hideDelay: 100,
    autoHide: true
}

// 2. 创建拦截逻辑
const patchTooltip = (binding: DirectiveBinding) => {
    if (!binding.value) return

    if (typeof binding.value === 'string') {
        // 将 v-tooltip="'text'" 转换为对象，并注入全局延迟
        binding.value = {
            value: binding.value,
            ...GLOBAL_TOOLTIP_CONFIG
        }
    } else if (typeof binding.value === 'object') {
        // 如果用户没定义延迟，则使用全局延迟
        binding.value.showDelay ??= GLOBAL_TOOLTIP_CONFIG.showDelay
        binding.value.hideDelay ??= GLOBAL_TOOLTIP_CONFIG.hideDelay
        binding.value.autoHide ??= GLOBAL_TOOLTIP_CONFIG.autoHide
    }
}

// 3. 注入到 Tooltip 钩子中
const originalBeforeMount = Tooltip.beforeMount
const originalUpdated = Tooltip.updated

Tooltip.beforeMount = function (...args: Parameters<NonNullable<typeof originalBeforeMount>>) {
    const [, binding] = args
    patchTooltip(binding)
    originalBeforeMount?.apply(this, args)
}

Tooltip.updated = function (...args: Parameters<NonNullable<typeof originalUpdated>>) {
    const [, binding] = args
    patchTooltip(binding)
    originalUpdated?.apply(this, args)
}

export default Tooltip
