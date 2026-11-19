import type { IAiLogSessionDetail, IAiLogSessionItem, IAiLogStepItem } from '@shared'
import type { Ref } from 'vue'
import type { IWorkRow } from './timeline'

import { useMessage } from '@renderer/components/control/message'
import { LogHelper, TaskHelper } from '@renderer/helper'
import { ipc } from '@renderer/ipc'
import { useIntervalFn } from '@vueuse/core'
import { computed, ref, watch } from 'vue'

import {
    formatSessionUsage,
    formatSource,
    formatStatus,
    formatTime,
    formatUsage,
    getStatusSeverity,
    getWorkLabel
} from './format'
import { buildSessionView, getUserMessages } from './timeline'
import {
    getToolIcon,
    getToolInput,
    getToolKind,
    getToolPrimary,
    getToolResult,
    getToolStats,
    getToolStatus,
    isToolError
} from './tool'

/** 每页会话数 */
const PAGE_SIZE = 30

/** AI 日志查看 Hook */
export function useAiLogView(active: Ref<boolean>) {
    const { confirmDialog, toast } = useMessage()

    const sessions = ref<IAiLogSessionItem[]>([])
    const total = ref(0)
    /** 标题筛选选项 */
    const sourceOptions = ref<{ label: string; value: string }[]>([])
    /** 选中的标题 */
    const selectedSources = ref<string[]>([])
    const selectedId = ref('')
    const detail = ref<IAiLogSessionDetail | null>(null)
    const steps = ref<IAiLogStepItem[]>([])
    const loadingSessions = ref(false)
    const loadingDetail = ref(false)
    const loadingSteps = ref(false)
    const loaded = ref(false)
    /** 列表请求序号 */
    let sessionsSeq = 0
    /** 跳过筛选重载 */
    let skipFilterReload = false

    /** 是否还有更多会话 */
    const hasMore = computed(() => sessions.value.length < total.value)

    /** 当前会话工作区视图 */
    const sessionView = computed(() => {
        if (!detail.value) return { rows: [] as IWorkRow[], finalText: '' }
        return buildSessionView(detail.value, steps.value)
    })

    /** 加载会话步骤 */
    async function loadSteps(sessionId: string, silent = false) {
        if (!silent) loadingSteps.value = true
        const result = await TaskHelper.tryExecute(() => ipc.aiLog.getSteps.query({ sessionId }))
        if (!silent) loadingSteps.value = false

        if (result.hasError) {
            if (!silent) {
                LogHelper.error('读取 AI 日志步骤失败：', result.error)
                toast.error('读取 AI 日志步骤失败')
            }
            return
        }

        if (selectedId.value !== sessionId) return
        steps.value = result.result
    }

    /** 加载筛选选项 */
    async function loadSourceOptions() {
        const result = await TaskHelper.tryExecute(() => ipc.aiLog.listSources.query())
        if (result.hasError) return

        sourceOptions.value = result.result.map((source) => ({
            label: formatSource(source),
            value: source ?? ''
        }))

        // 清理失效选中项
        const values = new Set(sourceOptions.value.map((item) => item.value))
        const valid = selectedSources.value.filter((value) => values.has(value))
        if (valid.length !== selectedSources.value.length) selectedSources.value = valid
    }

    /** 加载会话列表 */
    async function loadSessions(reset = false) {
        if (!reset && loadingSessions.value) return
        if (!reset && sessions.value.length >= total.value) return

        // 重置请求可抢占
        const seq = ++sessionsSeq
        loadingSessions.value = true
        const offset = reset ? 0 : sessions.value.length
        const result = await TaskHelper.tryExecute(() =>
            ipc.aiLog.listSessions.query({
                limit: PAGE_SIZE,
                offset,
                sources: selectedSources.value
            })
        )
        if (seq !== sessionsSeq) return
        loadingSessions.value = false

        if (result.hasError) {
            LogHelper.error('读取 AI 日志列表失败：', result.error)
            toast.error('读取 AI 日志失败')
            return
        }

        sessions.value = reset ? result.result.items : [...sessions.value, ...result.result.items]
        total.value = result.result.total

        if (!sessions.value.length) {
            selectedId.value = ''
            detail.value = null
            return
        }

        const first = sessions.value[0]
        if (!selectedId.value && first) await selectSession(first.id)
        if (
            reset &&
            first &&
            selectedId.value &&
            !sessions.value.some((item) => item.id === selectedId.value)
        ) {
            await selectSession(first.id)
        }
    }

    /** 选择会话并加载详情 */
    async function selectSession(sessionId: string) {
        if (selectedId.value === sessionId && detail.value) return

        selectedId.value = sessionId
        detail.value = null
        steps.value = []
        loadingDetail.value = true

        const result = await TaskHelper.tryExecute(() => ipc.aiLog.getSession.query({ sessionId }))
        loadingDetail.value = false

        if (result.hasError) {
            LogHelper.error('读取 AI 日志详情失败：', result.error)
            toast.error('读取 AI 日志详情失败')
            return
        }

        if (selectedId.value !== sessionId) return
        detail.value = result.result
        if (result.result) await loadSteps(sessionId)
    }

    /** 删除指定会话 */
    async function deleteSession(sessionId: string) {
        confirmDialog.yesOrNo('确认删除该会话记录吗？', async () => {
            const result = await TaskHelper.tryExecute(() =>
                ipc.aiLog.deleteSession.mutate({ sessionId })
            )
            if (result.hasError) {
                LogHelper.error('删除 AI 日志会话失败：', result.error)
                toast.error('删除 AI 日志会话失败')
                return
            }

            sessions.value = sessions.value.filter((item) => item.id !== sessionId)
            total.value = Math.max(0, total.value - 1)
            void loadSourceOptions()

            if (selectedId.value === sessionId) {
                selectedId.value = ''
                detail.value = null
                steps.value = []

                const first = sessions.value[0]
                if (first) await selectSession(first.id)
            }

            toast.success('会话已删除')
        })
    }

    /** 删除全部会话 */
    async function deleteAllSessions() {
        confirmDialog.yesOrNo('确认删除全部会话记录吗？此操作不可恢复。', async () => {
            const result = await TaskHelper.tryExecute(() => ipc.aiLog.deleteAllSessions.mutate())
            if (result.hasError) {
                LogHelper.error('删除全部 AI 日志会话失败：', result.error)
                toast.error('删除 AI 日志失败')
                return
            }

            sessions.value = []
            total.value = 0
            sourceOptions.value = []
            skipFilterReload = true
            selectedSources.value = []
            selectedId.value = ''
            detail.value = null
            steps.value = []
            toast.success('全部会话已删除')
        })
    }

    /** 静默刷新列表 */
    async function syncSessions() {
        if (loadingSessions.value) return

        // 最多拉取 100 条
        const seq = sessionsSeq
        const limit = Math.min(Math.max(sessions.value.length, PAGE_SIZE), 100)
        const result = await TaskHelper.tryExecute(() =>
            ipc.aiLog.listSessions.query({
                limit,
                offset: 0,
                sources: selectedSources.value
            })
        )
        // 丢弃过期结果
        if (result.hasError || seq !== sessionsSeq) return

        sessions.value = result.result.items
        total.value = result.result.total

        // 新来源时刷新选项
        const known = new Set(sourceOptions.value.map((item) => item.value))
        if (sessions.value.some((item) => !known.has(item.source ?? ''))) void loadSourceOptions()

        const first = sessions.value[0]
        if (!selectedId.value && first) await selectSession(first.id)
    }

    /** 静默刷新详情 */
    async function syncDetail() {
        const sessionId = selectedId.value
        if (!sessionId || detail.value?.session.status !== 'running') return
        if (loadingDetail.value || loadingSteps.value) return

        const result = await TaskHelper.tryExecute(() => ipc.aiLog.getSession.query({ sessionId }))
        if (result.hasError || selectedId.value !== sessionId || !result.result) return

        detail.value = result.result
        await loadSteps(sessionId, true)
    }

    // 每秒刷新列表与详情
    useIntervalFn(() => {
        if (!active.value) return

        void syncSessions()
        void syncDetail()
    }, 1000)

    // 筛选变化时重载
    watch(selectedSources, () => {
        if (skipFilterReload) {
            skipFilterReload = false
            return
        }
        if (!active.value) return
        void loadSessions(true)
    })

    // 首次进入时加载
    watch(
        active,
        (value) => {
            if (!value || loaded.value) return

            loaded.value = true
            void loadSourceOptions()
            void loadSessions(true)
        },
        { immediate: true }
    )

    return {
        /** 会话列表 */
        sessions,
        /** 会话总数 */
        total,
        /** 标题筛选选项 */
        sourceOptions,
        /** 选中的标题 */
        selectedSources,
        /** 当前选中的会话 ID */
        selectedId,
        /** 当前会话详情 */
        detail,
        /** 会话列表加载状态 */
        loadingSessions,
        /** 会话详情加载状态 */
        loadingDetail,
        /** 步骤加载状态 */
        loadingSteps,
        /** 是否还有更多会话 */
        hasMore,
        /** 当前会话工作区视图 */
        sessionView,
        /** 格式化时间 */
        formatTime,
        /** 格式化来源 */
        formatSource,
        /** 格式化状态 */
        formatStatus,
        /** 获取状态标签颜色 */
        getStatusSeverity,
        /** 格式化用量 */
        formatUsage,
        /** 格式化会话用量统计 */
        formatSessionUsage,
        /** 格式化工作区标题 */
        getWorkLabel,
        /** 提取用户消息 */
        getUserMessages,
        /** 获取工具图标 */
        getToolIcon,
        /** 获取工具类别 */
        getToolKind,
        /** 获取工具主文本 */
        getToolPrimary,
        /** 是否为工具错误 */
        isToolError,
        /** 获取工具状态文案 */
        getToolStatus,
        /** 获取工具输入文本 */
        getToolInput,
        /** 获取工具结果文本 */
        getToolResult,
        /** 获取工具统计文案 */
        getToolStats,
        /** 选择会话并加载详情 */
        selectSession,
        /** 加载会话列表 */
        loadSessions,
        /** 删除指定会话 */
        deleteSession,
        /** 删除全部会话 */
        deleteAllSessions
    }
}
