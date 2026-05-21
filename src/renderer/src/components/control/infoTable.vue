<script setup lang="ts">
import Tag from 'primevue/tag'
import { computed, ref, watch } from 'vue'

/**
 * 信息项
 */
interface IInfoItem {
    [key: string]: string
}

/**
 * 渲染用信息项
 */
interface IRenderInfoItem {
    key: string
    value: string
}

/**
 * 渲染用分组项
 */
interface IRenderGroupItem {
    group: string
    items: IRenderInfoItem[]
    isDefault: boolean
}

/**
 * 组件属性
 */
interface IProps {
    info?: Record<string, IInfoItem[]>
}

const props = withDefaults(defineProps<IProps>(), {
    info: () => ({})
})

const openGroupMap = ref<Record<string, boolean>>({})

/**
 * 分组列表
 */
const groupList = computed<IRenderGroupItem[]>(() =>
    Object.entries(props.info).map(([group, items]) => ({
        group,
        items: items.flatMap((item) =>
            Object.entries(item).map(([key, value]) => ({
                key,
                value
            }))
        ),
        isDefault: group === 'default'
    }))
)

/**
 * 默认分组列表
 */
const defaultGroupList = computed(() => groupList.value.filter((item) => item.isDefault))

/**
 * 可折叠分组列表
 */
const collapsibleGroupList = computed(() => groupList.value.filter((item) => !item.isDefault))

/**
 * key 列宽度
 */
const keyColumnWidth = computed(() => {
    const maxKeyLength = groupList.value.reduce((maxLength, groupItem) => {
        const currentMaxLength = groupItem.items.reduce(
            (itemMaxLength, item) => Math.max(itemMaxLength, item.key.length),
            0
        )

        return Math.max(maxLength, currentMaxLength)
    }, 0)

    return maxKeyLength > 0 ? `calc(${maxKeyLength}em + 2rem)` : 'auto'
})

/**
 * 同步分组展开状态
 */
function syncOpenGroupMap() {
    const nextOpenGroupMap: Record<string, boolean> = {}

    collapsibleGroupList.value.forEach((groupItem) => {
        nextOpenGroupMap[groupItem.group] = openGroupMap.value[groupItem.group] ?? true
    })

    openGroupMap.value = nextOpenGroupMap
}

/**
 * 切换分组展开状态
 * @param group 分组名
 */
function toggleGroup(group: string) {
    openGroupMap.value[group] = !openGroupMap.value[group]
}

watch(collapsibleGroupList, syncOpenGroupMap, {
    immediate: true
})
</script>

<template>
    <div class="info-table">
        <!-- 默认分组列表 -->
        <section v-for="groupItem in defaultGroupList" :key="groupItem.group" class="info-group">
            <!-- 默认分组表格 -->
            <table class="group-content">
                <colgroup>
                    <col :style="{ width: keyColumnWidth }" />
                    <col />
                </colgroup>
                <tbody>
                    <!-- 信息行 -->
                    <tr
                        v-for="(item, index) in groupItem.items"
                        :key="`${groupItem.group}-${index}`"
                        class="info-row"
                    >
                        <!-- 键名 -->
                        <td v-if="item.value" class="info-key">
                            <Tag :value="item.key" />
                        </td>
                        <!-- 键值 -->
                        <td v-if="item.value" class="info-value">
                            {{ item.value }}
                        </td>
                    </tr>
                </tbody>
            </table>
        </section>

        <!-- 可折叠分组列表 -->
        <section
            v-for="groupItem in collapsibleGroupList"
            :key="groupItem.group"
            class="info-group collapsible"
        >
            <!-- 分组头部 -->
            <button
                :aria-expanded="openGroupMap[groupItem.group]"
                class="group-header"
                type="button"
                @click="toggleGroup(groupItem.group)"
            >
                <span class="group-title-wrap">
                    <!-- 分组标题 -->
                    <h2 class="group-title">{{ groupItem.group }}</h2>
                    <!-- 折叠箭头 -->
                    <i
                        :class="{ open: openGroupMap[groupItem.group] }"
                        class="group-arrow pi pi-angle-right"
                    />
                </span>
            </button>

            <!-- 折叠内容 -->
            <div :class="{ open: openGroupMap[groupItem.group] }" class="group-collapse">
                <div class="group-collapse-inner">
                    <!-- 分组表格 -->
                    <table class="group-content">
                        <colgroup>
                            <col :style="{ width: keyColumnWidth }" />
                            <col />
                        </colgroup>
                        <tbody>
                            <!-- 信息行 -->
                            <tr
                                v-for="(item, index) in groupItem.items"
                                :key="`${groupItem.group}-${index}`"
                                class="info-row"
                            >
                                <!-- 键名 -->
                                <td v-if="item.value" class="info-key">
                                    <Tag :value="item.key" />
                                </td>
                                <!-- 键值 -->
                                <td v-if="item.value" class="info-value">
                                    {{ item.value }}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </section>
    </div>
</template>

<style lang="scss" scoped>
.info-table {
    display: flex;
    flex-direction: column;
    gap: 1rem;

    .info-group {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;

        &.collapsible {
            gap: 0;
        }
    }

    .group-header {
        width: fit-content;
        padding: 0.25rem 0;
        border: none;
        background: transparent;
        cursor: pointer;
        text-align: left;
        width: 100%;
        transform: none !important;
    }

    .group-title-wrap {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
    }

    .group-title {
        color: var(--p-text-color);
    }

    .group-arrow {
        font-size: 0.9rem;
        color: var(--p-text-muted-color);
        transition: transform 0.3s var(--animation-type);

        &.open {
            transform: rotate(90deg);
        }
    }

    .group-collapse {
        display: grid;
        grid-template-rows: 0fr;
        transition: grid-template-rows 0.3s var(--animation-type);

        &.open {
            grid-template-rows: 1fr;
        }
    }

    .group-collapse-inner {
        min-height: 0;
        overflow: hidden;
        padding-top: 0.25rem;
    }

    .group-content {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
    }

    .info-row {
        vertical-align: top;
    }

    .info-key {
        white-space: nowrap;
        padding: 0 0.75em 0.5em 0;
        vertical-align: top;
        text-align: end;
    }

    .info-value {
        width: 100%;
        padding: 0 0 0.5em;
        user-select: text;
        line-height: 1.75;
        white-space: pre-wrap;
        word-break: break-all;
        vertical-align: top;
    }
}
</style>
