import type { IAiLogSessionDetail, IAiLogSessionItem, IAiLogStepItem } from '@shared'
import type { Ref } from 'vue'
import type { IWorkRow } from './timeline'

import { useMessage } from '@renderer/components/control/message'
import { LogHelper, TaskHelper } from '@renderer/helper'
import { ipc } from '@renderer/ipc'
import { computed, ref, watch } from 'vue'

import {
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

/**
 * AI 日志查看 Hook
 * @param active 是否为当前激活页
 */
export function useAiLogView(active: Ref<boolean>) {
    const { toast } = useMessage()

    const sessions = ref<IAiLogSessionItem[]>([])
    const total = ref(0)
    const selectedId = ref('')
    const detail = ref<IAiLogSessionDetail | null>(null)
    const steps = ref<IAiLogStepItem[]>([])
    const loadingSessions = ref(false)
    const loadingDetail = ref(false)
    const loadingSteps = ref(false)
    const loaded = ref(false)

    /** 是否还有更多会话 */
    const hasMore = computed(() => sessions.value.length < total.value)

    /** 当前会话工作区视图 */
    const sessionView = computed(() => {
        if (!detail.value) return { rows: [] as IWorkRow[], finalText: '' }
        return buildSessionView(detail.value, steps.value)
    })

    /**
     * 加载会话步骤
     * @param sessionId 会话 ID
     */
    async function loadSteps(sessionId: string) {
        loadingSteps.value = true
        const result = await TaskHelper.tryExecute(() => ipc.aiLog.getSteps.query({ sessionId }))
        loadingSteps.value = false

        if (result.hasError) {
            LogHelper.error('读取 AI 日志步骤失败：', result.error)
            toast.error('读取 AI 日志步骤失败')
            return
        }

        if (selectedId.value !== sessionId) return
        steps.value = result.result
    }

    /**
     * 加载会话列表
     * @param reset 是否从第一页重新加载
     */
    async function loadSessions(reset = false) {
        if (loadingSessions.value) return
        if (!reset && sessions.value.length >= total.value) return

        loadingSessions.value = true
        const offset = reset ? 0 : sessions.value.length
        const result = await TaskHelper.tryExecute(() =>
            ipc.aiLog.listSessions.query({ limit: PAGE_SIZE, offset })
        )
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
            selectedId.value &&
            !sessions.value.some((item) => item.id === selectedId.value)
        ) {
            if (first) await selectSession(first.id)
        }
    }

    /**
     * 选择会话并加载详情
     * @param sessionId 会话 ID
     */
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
        if (detail.value) await loadSteps(sessionId)
    }

    /** 刷新会话列表 */
    async function refresh() {
        sessions.value = []
        total.value = 0
        selectedId.value = ''
        detail.value = null
        steps.value = []
        await loadSessions(true)
    }

    // 首次进入日志页时加载数据
    watch(
        active,
        (value) => {
            if (!value || loaded.value) return

            loaded.value = true
            void loadSessions(true)
        },
        { immediate: true }
    )

    return {
        /** 会话列表 */
        sessions,
        /** 会话总数 */
        total,
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
        /** 刷新会话列表 */
        refresh
    }
}
