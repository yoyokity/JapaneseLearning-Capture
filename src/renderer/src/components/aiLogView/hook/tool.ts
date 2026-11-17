/** 工具项 */
export interface IToolItem {
    key: string
    name: string
    input: unknown
    output: unknown
    error: unknown
}

/** 工具类别文案 */
const TOOL_KIND_LABELS: Record<string, string> = {
    read_file: '读取文件',
    edit_file: '编辑文件',
    get_word_timings: '查询词级时间'
}

/** 工具图标 */
const TOOL_ICONS: Record<string, string> = {
    read_file: 'pi pi-file',
    edit_file: 'pi pi-pen-to-square',
    get_word_timings: 'pi pi-clock'
}

/**
 * 格式化 JSON
 * @param value 任意值
 */
function formatJson(value: unknown) {
    if (value === null || value === undefined) return ''
    return JSON.stringify(value, null, 2)
}

/**
 * 格式化错误
 * @param error 错误
 */
function formatError(error: unknown) {
    if (error instanceof Error) return error.message
    if (typeof error === 'string') return error
    if (error && typeof error === 'object') {
        const item = error as { message?: unknown }
        if (typeof item.message === 'string') return item.message
    }
    return formatJson(error) || String(error)
}

/**
 * 获取工具文件路径
 * @param input 工具输入
 */
function getToolFilePath(input: unknown) {
    if (!input || typeof input !== 'object') return ''

    const item = input as Record<string, unknown>
    const filePath = item.file_path ?? item.path
    return typeof filePath === 'string' ? filePath : ''
}

/**
 * 获取工具图标
 * @param tool 工具
 */
export function getToolIcon(tool: IToolItem | null) {
    if (!tool) return 'pi pi-wrench'
    return TOOL_ICONS[tool.name] ?? 'pi pi-wrench'
}

/**
 * 获取工具类别
 * @param tool 工具
 */
export function getToolKind(tool: IToolItem | null) {
    if (!tool) return ''
    return TOOL_KIND_LABELS[tool.name] ?? tool.name
}

/**
 * 获取工具主文本
 * @param tool 工具
 */
export function getToolPrimary(tool: IToolItem | null) {
    if (!tool) return ''

    const filePath = getToolFilePath(tool.input)
    if (filePath) {
        const index = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
        return index >= 0 ? filePath.slice(index + 1) : filePath
    }

    if (tool.input && typeof tool.input === 'object') {
        const item = tool.input as Record<string, unknown>
        if (typeof item.from === 'string' && typeof item.to === 'string') {
            return `${item.from} → ${item.to}`
        }

        const first = Object.values(item).find((value) => typeof value === 'string')
        if (typeof first === 'string') return first
    }

    return ''
}

/**
 * 是否为工具错误
 * @param tool 工具
 */
export function isToolError(tool: IToolItem | null) {
    if (!tool) return false
    if (tool.error) return true

    return Boolean(
        tool.output &&
        typeof tool.output === 'object' &&
        (tool.output as { ok?: unknown }).ok === false
    )
}

/**
 * 获取工具状态文案
 * @param tool 工具
 * @remark 成功状态不展示，保持行内简洁
 */
export function getToolStatus(tool: IToolItem | null) {
    if (!tool) return ''
    if (isToolError(tool)) return '失败'
    if (tool.output === null || tool.output === undefined) return '无结果'
    return ''
}

/**
 * 获取工具输入文本
 * @param tool 工具
 */
export function getToolInput(tool: IToolItem | null) {
    if (!tool) return ''
    // 读取工具只展示路径，输入信息没有额外价值
    if (tool.name === 'read_file') return ''
    return formatJson(tool.input)
}

/**
 * 获取工具结果文本
 * @param tool 工具
 */
export function getToolResult(tool: IToolItem | null) {
    if (!tool) return ''
    if (tool.error) return formatError(tool.error)

    const output = tool.output
    if (output && typeof output === 'object') {
        const item = output as {
            ok?: unknown
            content?: unknown
            error?: unknown
            message?: unknown
        }
        if (item.ok === false) return formatError(item.error ?? item.message ?? output)
        if (typeof item.content === 'string') return item.content
    }

    return formatJson(output) || '无结果'
}

/**
 * 获取工具统计文案
 * @param tools 工具列表
 */
export function getToolStats(tools: IToolItem[]) {
    let read = 0
    let query = 0
    let other = 0
    const files = new Set<string>()

    for (const tool of tools) {
        if (tool.name === 'read_file') {
            read += 1
        } else if (tool.name === 'get_word_timings') {
            query += 1
        } else if (tool.name === 'edit_file') {
            const filePath = getToolFilePath(tool.input)
            if (filePath) files.add(filePath)
            else other += 1
        } else {
            other += 1
        }
    }

    const parts: string[] = []
    if (read) parts.push(`已查阅 ${read} 项`)
    if (query) parts.push(`已查询 ${query} 次`)
    if (files.size) parts.push(`已修改 ${files.size} 文件`)
    if (other) parts.push(`已执行 ${other} 项`)

    return parts.join('，') || '工具调用'
}
