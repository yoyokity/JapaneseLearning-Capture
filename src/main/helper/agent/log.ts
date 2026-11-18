import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { app } from 'electron'

/** AI 日志数据库文件名 */
const AI_LOG_DB_FILE = 'ai.db'

/** 会话表结构 */
const SESSION_TABLE_SQL = `
    CREATE TABLE IF NOT EXISTS ai_sessions (
        id TEXT PRIMARY KEY,
        source TEXT,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        api_format TEXT,
        reasoning_effort TEXT,
        input_json TEXT NOT NULL,
        system TEXT,
        status TEXT NOT NULL,
        finish_reason TEXT,
        error TEXT,
        text TEXT,
        reasoning_text TEXT,
        usage_json TEXT,
        response_messages_json TEXT,
        started_at INTEGER NOT NULL,
        finished_at INTEGER
    );
`

/** 尝试表结构 */
const ATTEMPT_TABLE_SQL = `
    CREATE TABLE IF NOT EXISTS ai_attempts (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES ai_sessions(id) ON DELETE CASCADE,
        attempt_no INTEGER NOT NULL,
        status TEXT NOT NULL,
        retry_reason TEXT,
        status_code INTEGER,
        timeout_ms INTEGER,
        delay_ms INTEGER,
        error TEXT,
        text TEXT,
        reasoning_text TEXT,
        usage_json TEXT,
        started_at INTEGER NOT NULL,
        finished_at INTEGER
    );
`

/** 步骤表结构 */
const STEP_TABLE_SQL = `
    CREATE TABLE IF NOT EXISTS ai_steps (
        id TEXT PRIMARY KEY,
        attempt_id TEXT NOT NULL REFERENCES ai_attempts(id) ON DELETE CASCADE,
        step_number INTEGER NOT NULL,
        call_id TEXT,
        provider TEXT,
        model TEXT,
        content_json TEXT,
        tool_calls_json TEXT,
        tool_results_json TEXT,
        text TEXT,
        reasoning_text TEXT,
        finish_reason TEXT,
        raw_finish_reason TEXT,
        usage_json TEXT,
        performance_json TEXT,
        request_json TEXT,
        response_json TEXT,
        provider_metadata_json TEXT,
        created_at INTEGER NOT NULL
    );
`

/** 索引定义 */
const INDEX_SQL = `
    CREATE INDEX IF NOT EXISTS idx_ai_sessions_started ON ai_sessions (started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ai_attempts_session ON ai_attempts (session_id, attempt_no);
    CREATE INDEX IF NOT EXISTS idx_ai_steps_attempt ON ai_steps (attempt_id, step_number);
`

/** 数据库连接 */
let db: DatabaseSync | null = null

interface IStepLog {
    stepNumber: number
    callId?: string | undefined
    model?: { provider: string; modelId: string } | undefined
    content?: unknown
    toolCalls?: unknown
    toolResults?: unknown
    text?: string | undefined
    reasoningText?: string | undefined
    finishReason?: string | undefined
    rawFinishReason?: string | undefined
    usage?: unknown
    performance?: unknown
    request?: unknown
    response?: unknown
    providerMetadata?: unknown
}

interface ISessionLog {
    id: string
    source?: string | undefined
    provider: string
    model: string
    apiFormat?: string | undefined
    reasoningEffort?: string | undefined
    input: unknown
    system?: string | undefined
}

interface IAttemptFinishLog {
    status: 'success' | 'error' | 'retried' | 'cancelled'
    retryReason?: string | undefined
    statusCode?: number | undefined
    timeoutMs?: number | undefined
    delayMs?: number | undefined
    error?: string | undefined
    text?: string | undefined
    reasoningText?: string | undefined
    usage?: unknown
}

interface ISessionFinishLog {
    status: 'success' | 'error' | 'cancelled'
    finishReason?: string | undefined
    error?: string | undefined
    text?: string | undefined
    reasoningText?: string | undefined
    usage?: unknown
    responseMessages?: unknown
}

export interface IAiLogListOptions {
    limit: number
    offset: number
}

export interface IAiLogSessionItem {
    id: string
    source: string | null
    provider: string
    model: string
    apiFormat: string | null
    reasoningEffort: string | null
    status: string
    finishReason: string | null
    startedAt: number
    finishedAt: number | null
    attemptCount: number
}

export interface IAiLogAttemptItem {
    id: string
    attemptNo: number
    status: string
    retryReason: string | null
    statusCode: number | null
    timeoutMs: number | null
    delayMs: number | null
    error: string | null
    text: string | null
    reasoningText: string | null
    usage: unknown
    startedAt: number
    finishedAt: number | null
    stepCount: number
}

export interface IAiLogSessionRecord {
    id: string
    source: string | null
    provider: string
    model: string
    apiFormat: string | null
    reasoningEffort: string | null
    status: string
    finishReason: string | null
    error: string | null
    text: string | null
    reasoningText: string | null
    input: unknown
    system: string | null
    usage: unknown
    responseMessages: unknown
    startedAt: number
    finishedAt: number | null
}

export interface IAiLogSessionDetail {
    session: IAiLogSessionRecord
    attempts: IAiLogAttemptItem[]
}

export interface IAiLogStepItem {
    id: string
    attemptId: string
    attemptNo: number
    stepNumber: number
    callId: string | null
    provider: string | null
    model: string | null
    content: unknown
    toolCalls: unknown
    toolResults: unknown
    text: string | null
    reasoningText: string | null
    finishReason: string | null
    rawFinishReason: string | null
    usage: unknown
    performance: unknown
    request: unknown
    response: unknown
    providerMetadata: unknown
    createdAt: number
}

interface IAiLogSessionRow {
    id: string
    source: string | null
    provider: string
    model: string
    apiFormat: string | null
    reasoningEffort: string | null
    status: string
    finishReason: string | null
    error: string | null
    text: string | null
    reasoningText: string | null
    inputJson: string | null
    system: string | null
    usageJson: string | null
    responseMessagesJson: string | null
    startedAt: number
    finishedAt: number | null
}

interface IAiLogAttemptRow {
    id: string
    attemptNo: number
    status: string
    retryReason: string | null
    statusCode: number | null
    timeoutMs: number | null
    delayMs: number | null
    error: string | null
    text: string | null
    reasoningText: string | null
    usageJson: string | null
    startedAt: number
    finishedAt: number | null
    stepCount: number
}

interface IAiLogStepRow {
    id: string
    attemptId: string
    attemptNo: number
    stepNumber: number
    callId: string | null
    provider: string | null
    model: string | null
    contentJson: string | null
    toolCallsJson: string | null
    toolResultsJson: string | null
    text: string | null
    reasoningText: string | null
    finishReason: string | null
    rawFinishReason: string | null
    usageJson: string | null
    performanceJson: string | null
    requestJson: string | null
    responseJson: string | null
    providerMetadataJson: string | null
    createdAt: number
}

/** 迁移旧版轮次结构 */
function migrateLegacyTurns(database: DatabaseSync) {
    const legacy = database
        .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'ai_turns'")
        .get()
    if (!legacy) return

    try {
        database.exec('PRAGMA foreign_keys = OFF')
        database.exec('PRAGMA legacy_alter_table = ON')
        database.exec('BEGIN')

        database.exec('ALTER TABLE ai_sessions RENAME TO ai_sessions_old')
        database.exec('ALTER TABLE ai_attempts RENAME TO ai_attempts_old')
        database.exec(SESSION_TABLE_SQL)
        database.exec(ATTEMPT_TABLE_SQL)

        database.exec(`
            INSERT INTO ai_sessions
                (id, source, provider, model, api_format, reasoning_effort, input_json, system,
                 status, finish_reason, error, text, reasoning_text, usage_json,
                 response_messages_json, started_at, finished_at)
            SELECT
                s.id, s.source, s.provider, s.model, s.api_format, s.reasoning_effort,
                COALESCE(t.input_json, '{}'), t.system, COALESCE(t.status, 'running'),
                t.finish_reason, t.error, t.text, t.reasoning_text, t.usage_json,
                t.response_messages_json, COALESCE(t.started_at, s.created_at), t.finished_at
            FROM ai_sessions_old s
            LEFT JOIN ai_turns t ON t.id = (
                SELECT id FROM ai_turns WHERE session_id = s.id ORDER BY turn_index DESC LIMIT 1
            )
        `)

        database.exec(`
            INSERT INTO ai_attempts
                (id, session_id, attempt_no, status, retry_reason, status_code, timeout_ms,
                 delay_ms, error, text, reasoning_text, usage_json, started_at, finished_at)
            SELECT
                a.id, t.session_id, a.attempt_no, a.status, a.retry_reason, a.status_code,
                a.timeout_ms, a.delay_ms, a.error, a.text, a.reasoning_text, a.usage_json,
                a.started_at, a.finished_at
            FROM ai_attempts_old a
            JOIN ai_turns t ON t.id = a.turn_id
            WHERE t.id = (
                SELECT id FROM ai_turns WHERE session_id = t.session_id
                ORDER BY turn_index DESC LIMIT 1
            )
        `)

        database.exec('DELETE FROM ai_steps WHERE attempt_id NOT IN (SELECT id FROM ai_attempts)')
        database.exec('DROP TABLE ai_attempts_old')
        database.exec('DROP TABLE ai_turns')
        database.exec('DROP TABLE ai_sessions_old')
        database.exec('COMMIT')
    } catch (error) {
        try {
            database.exec('ROLLBACK')
        } catch {
            // 回滚失败时保留原始错误
        }
        console.warn('AI 日志迁移失败：', error)
    } finally {
        database.exec('PRAGMA legacy_alter_table = OFF')
        database.exec('PRAGMA foreign_keys = ON')
    }
}

/** 获取数据库连接 */
function getDb() {
    if (db) return db

    const logsPath = app.getPath('logs')
    mkdirSync(logsPath, { recursive: true })

    db = new DatabaseSync(join(logsPath, AI_LOG_DB_FILE))
    db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA busy_timeout = 5000;
    `)

    migrateLegacyTurns(db)
    db.exec('PRAGMA foreign_keys = ON')
    db.exec(`${SESSION_TABLE_SQL}${ATTEMPT_TABLE_SQL}${STEP_TABLE_SQL}${INDEX_SQL}`)

    return db
}

/** 序列化为 JSON */
function toJson(value: unknown) {
    if (value === undefined) return null

    try {
        return JSON.stringify(value) ?? String(value)
    } catch {
        return String(value)
    }
}

/** 解析 JSON 文本 */
function parseJson(value: unknown) {
    if (typeof value !== 'string' || !value) return null

    try {
        return JSON.parse(value)
    } catch {
        return null
    }
}

/** 执行数据库写入 */
function write(action: () => void) {
    try {
        action()
    } catch (error) {
        console.warn('AI 日志写入失败：', error)
    }
}

export const log = {
    /** 开始会话 */
    startSession(session: ISessionLog) {
        write(() => {
            getDb()
                .prepare(
                    `INSERT INTO ai_sessions
                        (id, source, provider, model, api_format, reasoning_effort,
                         input_json, system, status, started_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'running', ?)`
                )
                .run(
                    session.id,
                    session.source ?? null,
                    session.provider,
                    session.model,
                    session.apiFormat ?? null,
                    session.reasoningEffort ?? null,
                    toJson(session.input) ?? '{}',
                    session.system ?? null,
                    Date.now()
                )
        })
    },

    /** 开始尝试 */
    startAttempt(sessionId: string, attemptNo: number) {
        const id = randomUUID()

        write(() => {
            getDb()
                .prepare(
                    `INSERT INTO ai_attempts (id, session_id, attempt_no, status, started_at)
                     VALUES (?, ?, ?, 'running', ?)`
                )
                .run(id, sessionId, attemptNo, Date.now())
        })

        return id
    },

    /** 结束尝试 */
    finishAttempt(attemptId: string, finish: IAttemptFinishLog) {
        write(() => {
            getDb()
                .prepare(
                    `UPDATE ai_attempts SET
                        status = ?, retry_reason = ?, status_code = ?, timeout_ms = ?, delay_ms = ?,
                        error = ?, text = ?, reasoning_text = ?, usage_json = ?, finished_at = ?
                     WHERE id = ? AND status = 'running'`
                )
                .run(
                    finish.status,
                    finish.retryReason ?? null,
                    finish.statusCode ?? null,
                    finish.timeoutMs ?? null,
                    finish.delayMs ?? null,
                    finish.error ?? null,
                    finish.text ?? null,
                    finish.reasoningText ?? null,
                    toJson(finish.usage),
                    Date.now(),
                    attemptId
                )
        })
    },

    /** 保存步骤 */
    saveStep(attemptId: string, step: IStepLog) {
        write(() => {
            getDb()
                .prepare(
                    `INSERT INTO ai_steps
                        (id, attempt_id, step_number, call_id, provider, model, content_json,
                         tool_calls_json, tool_results_json, text, reasoning_text, finish_reason,
                         raw_finish_reason, usage_json, performance_json, request_json, response_json,
                         provider_metadata_json, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
                )
                .run(
                    randomUUID(),
                    attemptId,
                    step.stepNumber,
                    step.callId ?? null,
                    step.model?.provider ?? null,
                    step.model?.modelId ?? null,
                    toJson(step.content),
                    toJson(step.toolCalls),
                    toJson(step.toolResults),
                    step.text ?? null,
                    step.reasoningText ?? null,
                    step.finishReason ?? null,
                    step.rawFinishReason ?? null,
                    toJson(step.usage),
                    toJson(step.performance),
                    toJson(step.request),
                    toJson(step.response),
                    toJson(step.providerMetadata),
                    Date.now()
                )
        })
    },

    /** 结束会话 */
    finishSession(sessionId: string, finish: ISessionFinishLog) {
        write(() => {
            getDb()
                .prepare(
                    `UPDATE ai_sessions SET
                        status = ?, finish_reason = ?, error = ?, text = ?, reasoning_text = ?,
                        usage_json = ?, response_messages_json = ?, finished_at = ?
                     WHERE id = ? AND status = 'running'`
                )
                .run(
                    finish.status,
                    finish.finishReason ?? null,
                    finish.error ?? null,
                    finish.text ?? null,
                    finish.reasoningText ?? null,
                    toJson(finish.usage),
                    toJson(finish.responseMessages),
                    Date.now(),
                    sessionId
                )
        })
    },

    /** 查询会话列表 */
    listSessions(options: IAiLogListOptions) {
        const database = getDb()
        const totalRow = database.prepare('SELECT COUNT(*) AS total FROM ai_sessions').get()
        const total = Number((totalRow as { total?: number } | undefined)?.total ?? 0)
        const items = database
            .prepare(
                `SELECT s.id, s.source, s.provider, s.model, s.api_format AS apiFormat,
                        s.reasoning_effort AS reasoningEffort, s.status,
                        s.finish_reason AS finishReason, s.started_at AS startedAt,
                        s.finished_at AS finishedAt,
                        (SELECT COUNT(*) FROM ai_attempts a WHERE a.session_id = s.id) AS attemptCount
                 FROM ai_sessions s
                 ORDER BY s.started_at DESC
                 LIMIT ? OFFSET ?`
            )
            .all(options.limit, options.offset) as unknown as IAiLogSessionItem[]

        return { items, total }
    },

    /** 查询会话详情 */
    getSessionDetail(sessionId: string) {
        const database = getDb()
        const row = database
            .prepare(
                `SELECT id, source, provider, model, api_format AS apiFormat,
                        reasoning_effort AS reasoningEffort, status,
                        finish_reason AS finishReason, error, text, reasoning_text AS reasoningText,
                        input_json AS inputJson, system, usage_json AS usageJson,
                        response_messages_json AS responseMessagesJson,
                        started_at AS startedAt, finished_at AS finishedAt
                 FROM ai_sessions WHERE id = ?`
            )
            .get(sessionId) as unknown as IAiLogSessionRow | undefined
        if (!row) return null

        const attemptRows = database
            .prepare(
                `SELECT id, attempt_no AS attemptNo, status, retry_reason AS retryReason,
                        status_code AS statusCode, timeout_ms AS timeoutMs, delay_ms AS delayMs,
                        error, text, reasoning_text AS reasoningText, usage_json AS usageJson,
                        started_at AS startedAt, finished_at AS finishedAt,
                        (SELECT COUNT(*) FROM ai_steps s WHERE s.attempt_id = a.id) AS stepCount
                 FROM ai_attempts a
                 WHERE session_id = ?
                 ORDER BY attempt_no`
            )
            .all(sessionId) as unknown as IAiLogAttemptRow[]

        const attempts = attemptRows.map<IAiLogAttemptItem>((attempt) => ({
            id: attempt.id,
            attemptNo: attempt.attemptNo,
            status: attempt.status,
            retryReason: attempt.retryReason,
            statusCode: attempt.statusCode,
            timeoutMs: attempt.timeoutMs,
            delayMs: attempt.delayMs,
            error: attempt.error,
            text: attempt.text,
            reasoningText: attempt.reasoningText,
            usage: parseJson(attempt.usageJson),
            startedAt: attempt.startedAt,
            finishedAt: attempt.finishedAt,
            stepCount: attempt.stepCount
        }))

        const session: IAiLogSessionRecord = {
            id: row.id,
            source: row.source,
            provider: row.provider,
            model: row.model,
            apiFormat: row.apiFormat,
            reasoningEffort: row.reasoningEffort,
            status: row.status,
            finishReason: row.finishReason,
            error: row.error,
            text: row.text,
            reasoningText: row.reasoningText,
            input: parseJson(row.inputJson),
            system: row.system,
            usage: parseJson(row.usageJson),
            responseMessages: parseJson(row.responseMessagesJson),
            startedAt: row.startedAt,
            finishedAt: row.finishedAt
        }

        return { session, attempts }
    },

    /** 查询会话所有步骤 */
    getSessionSteps(sessionId: string) {
        const rows = getDb()
            .prepare(
                `SELECT s.id, s.attempt_id AS attemptId, a.attempt_no AS attemptNo,
                        s.step_number AS stepNumber, s.call_id AS callId, s.provider, s.model,
                        s.content_json AS contentJson, s.tool_calls_json AS toolCallsJson,
                        s.tool_results_json AS toolResultsJson, s.text,
                        s.reasoning_text AS reasoningText, s.finish_reason AS finishReason,
                        s.raw_finish_reason AS rawFinishReason, s.usage_json AS usageJson,
                        s.performance_json AS performanceJson, s.request_json AS requestJson,
                        s.response_json AS responseJson,
                        s.provider_metadata_json AS providerMetadataJson,
                        s.created_at AS createdAt
                 FROM ai_steps s
                 JOIN ai_attempts a ON a.id = s.attempt_id
                 WHERE a.session_id = ?
                 ORDER BY a.attempt_no, s.step_number`
            )
            .all(sessionId) as unknown as IAiLogStepRow[]

        return rows.map<IAiLogStepItem>((row) => ({
            id: row.id,
            attemptId: row.attemptId,
            attemptNo: row.attemptNo,
            stepNumber: row.stepNumber,
            callId: row.callId,
            provider: row.provider,
            model: row.model,
            content: parseJson(row.contentJson),
            toolCalls: parseJson(row.toolCallsJson),
            toolResults: parseJson(row.toolResultsJson),
            text: row.text,
            reasoningText: row.reasoningText,
            finishReason: row.finishReason,
            rawFinishReason: row.rawFinishReason,
            usage: parseJson(row.usageJson),
            performance: parseJson(row.performanceJson),
            request: parseJson(row.requestJson),
            response: parseJson(row.responseJson),
            providerMetadata: parseJson(row.providerMetadataJson),
            createdAt: row.createdAt
        }))
    },

    /** 删除会话及其所有尝试与步骤 */
    deleteSession(sessionId: string) {
        const database = getDb()
        database.exec('BEGIN')

        try {
            // 兼容早期没有外键约束的数据库，按顺序显式删除
            database
                .prepare(
                    `DELETE FROM ai_steps
                     WHERE attempt_id IN (SELECT id FROM ai_attempts WHERE session_id = ?)`
                )
                .run(sessionId)
            database.prepare('DELETE FROM ai_attempts WHERE session_id = ?').run(sessionId)
            database.prepare('DELETE FROM ai_sessions WHERE id = ?').run(sessionId)
            database.exec('COMMIT')
        } catch (error) {
            database.exec('ROLLBACK')
            throw error
        }
    },

    /** 删除所有会话及其尝试与步骤 */
    deleteAllSessions() {
        const database = getDb()
        database.exec('BEGIN')

        try {
            database.exec('DELETE FROM ai_steps')
            database.exec('DELETE FROM ai_attempts')
            database.exec('DELETE FROM ai_sessions')
            database.exec('COMMIT')
        } catch (error) {
            database.exec('ROLLBACK')
            throw error
        }
    },

    /** 关闭数据库 */
    close() {
        if (!db) return

        try {
            db.close()
        } catch (error) {
            console.warn('AI 日志数据库关闭失败：', error)
        } finally {
            db = null
        }
    }
}
