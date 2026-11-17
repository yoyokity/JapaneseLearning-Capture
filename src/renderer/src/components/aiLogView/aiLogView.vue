<script lang="ts" setup>
import TextButton from '@renderer/components/control/button/textButton.vue'
import Markdown from '@renderer/components/control/markdown.vue'
import Scroll from '@renderer/components/control/scroll/scroll.vue'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import { toRef } from 'vue'

import { useAiLogView } from './hook'

interface IProps {
    /** 是否为当前激活页 */
    active?: boolean
}

const props = withDefaults(defineProps<IProps>(), { active: true })

const {
    sessions,
    total,
    selectedId,
    detail,
    loadingSessions,
    loadingDetail,
    loadingSteps,
    hasMore,
    sessionView,
    formatTime,
    formatSource,
    formatStatus,
    getStatusSeverity,
    formatUsage,
    getWorkLabel,
    getUserMessages,
    getToolIcon,
    getToolKind,
    getToolPrimary,
    isToolError,
    getToolStatus,
    getToolInput,
    getToolResult,
    getToolStats,
    selectSession,
    loadSessions,
    refresh
} = useAiLogView(toRef(props, 'active'))
</script>

<template>
    <div class="ai-log-view">
        <div class="session-panel">
            <div class="panel-header">
                <span class="title">会话</span>
                <span class="count">{{ total }}</span>
                <TextButton
                    class="refresh-button"
                    icon="pi pi-refresh"
                    :disabled="loadingSessions"
                    @click="refresh"
                />
            </div>
            <Scroll class="session-list" occupy-space="0.25rem">
                <div v-if="!sessions.length && !loadingSessions" class="empty">暂无 AI 日志</div>

                <div
                    v-for="session in sessions"
                    :key="session.id"
                    class="session-item"
                    :class="{ active: session.id === selectedId }"
                    @click="selectSession(session.id)"
                >
                    <div class="session-top">
                        <span class="source">{{ formatSource(session.source) }}</span>
                        <Tag
                            :severity="getStatusSeverity(session.status)"
                            :value="formatStatus(session.status)"
                        />
                    </div>
                    <div class="session-model">{{ session.model }}</div>
                    <div class="session-meta">
                        <span>{{ formatTime(session.startedAt) }}</span>
                        <span v-if="session.attemptCount > 1">
                            {{ session.attemptCount }} 次尝试
                        </span>
                    </div>
                </div>

                <div v-if="loadingSessions" class="empty">加载中…</div>
                <Button
                    v-if="hasMore"
                    class="load-more"
                    label="加载更多"
                    severity="secondary"
                    size="small"
                    text
                    @click="loadSessions()"
                />
            </Scroll>
        </div>

        <div class="detail-panel">
            <template v-if="detail">
                <div class="detail-header">
                    <div class="detail-title">
                        <span>{{ formatSource(detail.session.source) }}</span>
                        <span class="detail-status">
                            <Tag
                                :severity="getStatusSeverity(detail.session.status)"
                                :value="formatStatus(detail.session.status)"
                            />
                        </span>
                    </div>
                    <div class="detail-meta">
                        <span>{{ formatTime(detail.session.startedAt) }}</span>
                        <span v-if="formatUsage(detail.session.usage)" class="detail-usage">
                            {{ formatUsage(detail.session.usage) }}
                        </span>
                    </div>
                </div>

                <Scroll class="detail-scroll">
                    <section class="session">
                        <div
                            v-for="(message, index) in getUserMessages(detail.session.input)"
                            :key="index"
                            class="user-messages"
                        >
                            <div class="bubble">{{ message }}</div>
                        </div>

                        <details class="work-group" open>
                            <summary class="work-head">
                                <span class="work-label">{{ getWorkLabel(detail.session) }}</span>
                                <span class="work-meta">
                                    <span
                                        v-if="detail.session.status === 'error'"
                                        class="work-status"
                                    >
                                        失败
                                    </span>
                                </span>
                                <i class="pi pi-angle-right work-arrow" />
                            </summary>

                            <div class="work-body">
                                <details v-if="detail.session.system" class="work-row">
                                    <summary class="row-head">
                                        <i class="pi pi-cog row-icon" />
                                        <span class="row-kind">系统提示词</span>
                                        <span class="row-sub">
                                            {{ detail.session.system.length }} 字
                                        </span>
                                        <i class="pi pi-angle-right row-arrow" />
                                    </summary>
                                    <div class="tool-body">
                                        <div class="text-body">{{ detail.session.system }}</div>
                                    </div>
                                </details>

                                <div v-if="loadingSteps" class="row-sub">步骤加载中…</div>

                                <template v-for="row in sessionView.rows" :key="row.key">
                                    <div v-if="row.kind === 'attempt'" class="attempt-row">
                                        <span>尝试 #{{ row.attempt?.attemptNo }}</span>
                                        <span>{{ formatStatus(row.attempt?.status ?? null) }}</span>
                                        <span v-if="row.attempt?.retryReason">
                                            {{ row.attempt.retryReason }}
                                        </span>
                                        <span v-if="row.attempt?.statusCode">
                                            HTTP {{ row.attempt.statusCode }}
                                        </span>
                                        <span v-if="row.attempt?.delayMs">
                                            等待 {{ row.attempt.delayMs }}ms
                                        </span>
                                    </div>

                                    <details v-else-if="row.kind === 'reasoning'" class="work-row">
                                        <summary class="row-head">
                                            <i class="pi pi-lightbulb row-icon" />
                                            <span class="row-kind">思考</span>
                                            <span class="row-sub">{{ row.text.length }} 字</span>
                                            <i class="pi pi-angle-right row-arrow" />
                                        </summary>
                                        <div class="reasoning-body">{{ row.text }}</div>
                                    </details>

                                    <article
                                        v-else-if="row.kind === 'text'"
                                        class="assistant-inline"
                                    >
                                        <Markdown :content="row.text" />
                                    </article>

                                    <details v-else-if="row.kind === 'tool'" class="work-row">
                                        <summary class="row-head">
                                            <i :class="getToolIcon(row.tool)" class="row-icon" />
                                            <span class="row-kind">{{
                                                getToolKind(row.tool)
                                            }}</span>
                                            <span class="row-primary">
                                                {{ getToolPrimary(row.tool) }}
                                            </span>
                                            <span
                                                v-if="getToolStatus(row.tool)"
                                                class="row-status"
                                                :class="{ error: isToolError(row.tool) }"
                                            >
                                                {{ getToolStatus(row.tool) }}
                                            </span>
                                            <i class="pi pi-angle-right row-arrow" />
                                        </summary>
                                        <div class="tool-body">
                                            <pre v-if="getToolInput(row.tool)" class="code-block">{{
                                                getToolInput(row.tool)
                                            }}</pre>
                                            <pre
                                                class="code-block"
                                                :class="{ error: isToolError(row.tool) }"
                                                >{{ getToolResult(row.tool) }}</pre>
                                        </div>
                                    </details>

                                    <details v-else-if="row.kind === 'toolGroup'" class="work-row">
                                        <summary class="row-head">
                                            <i
                                                :class="getToolIcon(row.tools[0] ?? null)"
                                                class="row-icon"
                                            />
                                            <span class="row-sub">
                                                {{ getToolStats(row.tools) }}
                                            </span>
                                            <i class="pi pi-angle-right row-arrow" />
                                        </summary>
                                        <div class="tool-group-body">
                                            <details
                                                v-for="tool in row.tools"
                                                :key="tool.key"
                                                class="work-row"
                                            >
                                                <summary class="row-head">
                                                    <i
                                                        :class="getToolIcon(tool)"
                                                        class="row-icon"
                                                    />
                                                    <span class="row-kind">
                                                        {{ getToolKind(tool) }}
                                                    </span>
                                                    <span class="row-primary">
                                                        {{ getToolPrimary(tool) }}
                                                    </span>
                                                    <span
                                                        v-if="getToolStatus(tool)"
                                                        class="row-status"
                                                        :class="{ error: isToolError(tool) }"
                                                    >
                                                        {{ getToolStatus(tool) }}
                                                    </span>
                                                    <i class="pi pi-angle-right row-arrow" />
                                                </summary>
                                                <div class="tool-body">
                                                    <pre
                                                        v-if="getToolInput(tool)"
                                                        class="code-block"
                                                        >{{ getToolInput(tool) }}</pre>
                                                    <pre
                                                        class="code-block"
                                                        :class="{ error: isToolError(tool) }"
                                                        >{{ getToolResult(tool) }}</pre>
                                                </div>
                                            </details>
                                        </div>
                                    </details>

                                    <div v-else class="error-row">
                                        <i class="pi pi-exclamation-circle" />
                                        <span>{{ row.text }}</span>
                                    </div>
                                </template>

                                <div v-if="detail.session.error" class="error-row">
                                    <i class="pi pi-exclamation-circle" />
                                    <span>{{ detail.session.error }}</span>
                                </div>
                                <div
                                    v-else-if="detail.session.status === 'cancelled'"
                                    class="warn-row"
                                >
                                    <i class="pi pi-ban" />
                                    <span>已取消</span>
                                </div>
                            </div>
                        </details>

                        <article v-if="sessionView.finalText" class="assistant-final">
                            <Markdown :content="sessionView.finalText" />
                        </article>
                    </section>
                </Scroll>
            </template>

            <div v-else-if="loadingDetail" class="empty">加载中…</div>
            <div v-else class="empty">选择左侧会话查看详情</div>
        </div>
    </div>
</template>

<style lang="scss" scoped>
.ai-log-view {
    display: flex;
    height: 100%;
    overflow: hidden;
}

.session-panel {
    width: 20rem;
    min-width: 16rem;
    display: flex;
    flex-direction: column;
    border-right: var(--separator);
}

.panel-header {
    height: var(--header-height);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0 1rem;
    border-bottom: var(--separator);
}

.title {
    font-weight: 600;
}

.count {
    color: var(--p-text-muted-color);
    font-size: 0.75rem;
}

.refresh-button {
    margin-left: auto;
}

.session-list {
    flex: 1;
    min-height: 0;
    padding: 0.5rem;
}

.session-item {
    padding: 0.75rem;
    border-radius: var(--border-radius);
    cursor: pointer;
    transition: background-color 0.2s var(--animation-type);

    &:hover {
        background: var(--p-content-hover-background);
    }

    &.active {
        background: var(--p-surface-200);
    }
}

.session-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
}

.source {
    font-weight: 500;
}

.session-model {
    margin-top: 0.25rem;
    font-size: 0.8rem;
    color: var(--p-text-muted-color);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.session-meta {
    margin-top: 0.25rem;
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
    color: var(--p-text-muted-color);
}

.load-more {
    width: 100%;
    margin-top: 0.5rem;
}

.detail-panel {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
}

.detail-header {
    height: var(--header-height);
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 0 1.5rem;
    border-bottom: var(--separator);
}

.detail-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9375rem;
    font-weight: 600;
    line-height: 1.2;
}

.detail-status {
    display: inline-flex;
}

.detail-meta {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    margin-top: 0.125rem;
    font-size: 0.75rem;
    color: var(--p-text-muted-color);
}

.detail-usage {
    margin-left: auto;
    white-space: nowrap;
}

.detail-scroll {
    flex: 1;
    min-height: 0;
    padding: 1.25rem 1.5rem 3rem;
}

.session {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.user-messages {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.5rem;
}

.bubble {
    max-width: min(36rem, 100%);
    padding: 0.75rem 1rem;
    border: var(--separator);
    border-radius: 0.75rem;
    background: var(--p-content-hover-background);
    font-size: 0.875rem;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
    user-select: text;
}

.work-group {
    display: flex;
    flex-direction: column;
}

.work-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--p-content-border-color);
    color: var(--p-text-muted-color);
    font-size: 0.875rem;
    cursor: pointer;
    list-style: none;
    user-select: none;

    &::-webkit-details-marker {
        display: none;
    }
}

.work-label {
    flex-shrink: 0;
}

.work-meta {
    display: flex;
    gap: 0.5rem;
    white-space: nowrap;
}

.work-meta,
.work-status {
    color: var(--p-text-muted-color);
    font-size: 0.75rem;
}

.work-status {
    color: var(--error-color);
}

.work-arrow {
    flex-shrink: 0;
    font-size: 0.75rem;
    color: var(--p-text-muted-color);
    transition: transform 0.2s var(--animation-type);
}

.work-group[open] .work-arrow {
    transform: rotate(90deg);
}

.work-body {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding-top: 0.75rem;
}

.work-row {
    font-size: 0.875rem;

    &[open] > .row-head .row-arrow {
        opacity: 1;
        transform: rotate(90deg);
    }
}

.row-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 1.5rem;
    cursor: pointer;
    list-style: none;
    user-select: none;

    &::-webkit-details-marker {
        display: none;
    }

    &:hover {
        .row-arrow {
            opacity: 1;
        }

        .row-icon,
        .row-kind {
            color: var(--p-text-color);
        }
    }
}

.row-icon {
    flex-shrink: 0;
    width: 1rem;
    font-size: 0.875rem;
    text-align: center;
    color: var(--p-text-muted-color);
    transition: color 0.2s var(--animation-type);
}

.row-kind {
    flex-shrink: 0;
    color: var(--p-text-color);
    transition: color 0.2s var(--animation-type);
}

.row-primary {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--p-text-muted-color);
    font-size: 0.875rem;
}

.row-sub {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--p-text-muted-color);
    font-size: 0.75rem;
}

.row-status {
    flex-shrink: 0;
    color: var(--p-text-muted-color);
    font-size: 0.75rem;

    &.error {
        color: var(--error-color);
    }
}

.row-arrow {
    flex-shrink: 0;
    font-size: 0.75rem;
    color: var(--p-text-muted-color);
    opacity: 0;
    transition:
        opacity 0.2s var(--animation-type),
        transform 0.2s var(--animation-type);
}

.reasoning-body {
    margin: 0.5rem 0 0 0.5rem;
    padding-left: 0.875rem;
    border-left: 2px solid var(--p-content-border-color);
    color: var(--p-text-muted-color);
    font-size: 0.875rem;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 15rem;
    overflow: auto;
    user-select: text;
}

.tool-body {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding-top: 0.5rem;
    padding-left: 1.5rem;
}

.tool-group-body {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    padding-top: 0.5rem;
    padding-left: 1.5rem;

    .tool-body {
        padding-left: 1.5rem;
    }
}

.text-body {
    color: var(--p-text-muted-color);
    font-size: 0.875rem;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 15rem;
    overflow: auto;
    user-select: text;
}

.code-block {
    margin: 0;
    padding: 0.5rem 0.75rem;
    background: var(--p-content-hover-background);
    border-radius: var(--border-radius);
    font-family: ui-monospace, 'Cascadia Code', Consolas, monospace;
    font-size: 0.75rem;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-all;
    max-height: 20rem;
    overflow: auto;
    user-select: text;

    &.error {
        color: var(--error-color);
    }
}

.assistant-inline,
.assistant-final {
    user-select: text;

    :deep(.markdown-body) {
        background: transparent;
        color: var(--p-text-color);
        font-size: 0.875rem;
        line-height: 1.6;

        > :first-child {
            margin-top: 0;
        }

        > :last-child {
            margin-bottom: 0;
        }
    }
}

.attempt-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px dashed var(--p-content-border-color);
    color: var(--p-text-muted-color);
    font-size: 0.75rem;
}

.error-row,
.warn-row {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    font-size: 0.8125rem;
    line-height: 1.5;
    color: var(--error-color);
    white-space: pre-wrap;
    word-break: break-word;
    user-select: text;

    > i {
        margin-top: 0.15rem;
    }
}

.warn-row {
    color: var(--p-text-muted-color);
}

.empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    min-height: 6rem;
    color: var(--p-text-muted-color);
    font-size: 0.875rem;
}
</style>
