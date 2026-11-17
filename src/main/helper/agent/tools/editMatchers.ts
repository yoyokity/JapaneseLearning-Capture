export type EditMatchStrategy =
    | 'exact'
    | 'quote_normalized'
    | 'line_number_prefix_stripped'
    | 'escape_normalized'
    | 'unicode_escape_normalized'
    | 'line_trimmed'
    | 'indentation_flexible'
    | 'block_anchor'

export interface IEditMatchCandidate {
    value: string
    index: number
}

export type EditMatchResult =
    | {
          status: 'matched'
          actualString: string
          strategy: EditMatchStrategy
          candidateCount: number
          index: number
      }
    | { status: 'ambiguous'; strategy: EditMatchStrategy; candidateCount: number }
    | { status: 'not_found' }

const BROAD_MATCHERS = new Set<EditMatchStrategy>([
    'line_trimmed',
    'indentation_flexible',
    'block_anchor'
])

const BLOCK_ANCHOR_MIN_SIMILARITY = 0.8
const LEFT_SINGLE_CURLY_QUOTE = '‘'
const RIGHT_SINGLE_CURLY_QUOTE = '’'
const LEFT_DOUBLE_CURLY_QUOTE = '“'
const RIGHT_DOUBLE_CURLY_QUOTE = '”'
const LINE_NUMBER_PREFIX_PATTERN = /^\d+(?:\t|: )/
const UNICODE_ESCAPE_PATTERN = /\\u(?<hex>[0-9a-fA-F]{4})/g
const LETTER_PATTERN = /\p{L}/u

/** 查找实际匹配位置 */
export function findEditMatch(input: {
    content: string
    search: string
    replaceAll: boolean
}): EditMatchResult {
    const exact = collectExactCandidates(input.content, input.search)
    if (exact.length > 0) return toMatchResult('exact', exact)

    const strategies: EditMatchStrategy[] = [
        'quote_normalized',
        'line_number_prefix_stripped',
        'escape_normalized',
        'unicode_escape_normalized',
        'line_trimmed',
        'indentation_flexible',
        'block_anchor'
    ]

    for (const strategy of strategies) {
        if (input.replaceAll && BROAD_MATCHERS.has(strategy)) continue

        const candidates = collectCandidates(strategy, input.content, input.search)
        if (candidates.length > 0) return toMatchResult(strategy, candidates)
    }

    return { status: 'not_found' }
}

/** 按策略归一化替换文本 */
export function normalizeReplacementForMatch(strategy: EditMatchStrategy, newString: string) {
    if (strategy === 'escape_normalized') return unescapeVisibleCharacters(newString)
    if (strategy === 'unicode_escape_normalized') return unescapeUnicode(newString)
    return newString
}

/** 保留弯引号风格 */
export function preserveQuoteStyle(oldString: string, actualOldString: string, newString: string) {
    if (oldString === actualOldString) return newString

    let result = newString
    if (
        actualOldString.includes(LEFT_DOUBLE_CURLY_QUOTE) ||
        actualOldString.includes(RIGHT_DOUBLE_CURLY_QUOTE)
    ) {
        result = applyCurlyDoubleQuotes(result)
    }
    if (
        actualOldString.includes(LEFT_SINGLE_CURLY_QUOTE) ||
        actualOldString.includes(RIGHT_SINGLE_CURLY_QUOTE)
    ) {
        result = applyCurlySingleQuotes(result)
    }

    return result
}

function collectCandidates(strategy: EditMatchStrategy, content: string, search: string) {
    switch (strategy) {
        case 'exact':
            return collectExactCandidates(content, search)
        case 'quote_normalized':
            return collectQuoteNormalizedCandidates(content, search)
        case 'line_number_prefix_stripped':
            return collectPrefixedCandidates(content, search, stripLineNumberPrefix(search))
        case 'escape_normalized':
            return collectPrefixedCandidates(content, search, unescapeVisibleCharacters(search))
        case 'unicode_escape_normalized':
            return collectPrefixedCandidates(content, search, unescapeUnicode(search))
        case 'line_trimmed':
            return collectLineBlockCandidates(content, search, (a, b) => a.trim() === b.trim())
        case 'indentation_flexible':
            return collectLineBlockCandidates(
                content,
                search,
                (a, b) => a.trimStart() === b.trimStart()
            )
        case 'block_anchor':
            return collectBlockAnchorCandidates(content, search)
    }
}

function toMatchResult(
    strategy: EditMatchStrategy,
    candidates: IEditMatchCandidate[]
): EditMatchResult {
    const uniqueValues = [...new Set(candidates.map((candidate) => candidate.value))]
    if (uniqueValues.length !== 1) {
        return { status: 'ambiguous', strategy, candidateCount: candidates.length }
    }

    const first = candidates[0]
    if (!first) return { status: 'not_found' }

    return {
        status: 'matched',
        actualString: uniqueValues[0] ?? first.value,
        strategy,
        candidateCount: candidates.length,
        index: first.index
    }
}

function collectExactCandidates(content: string, search: string) {
    return collectOccurrences(content, search)
}

function collectOccurrences(content: string, search: string) {
    if (!search) return []

    const candidates: IEditMatchCandidate[] = []
    let index = content.indexOf(search)

    while (index !== -1) {
        candidates.push({ value: search, index })
        index = content.indexOf(search, index + search.length)
    }

    return candidates
}

function collectQuoteNormalizedCandidates(content: string, search: string) {
    const normalizedContent = normalizeQuotes(content)
    const normalizedSearch = normalizeQuotes(search)
    if (normalizedSearch === search && normalizedContent === content) return []

    const candidates: IEditMatchCandidate[] = []
    let index = normalizedContent.indexOf(normalizedSearch)

    while (index !== -1) {
        candidates.push({
            value: content.slice(index, index + normalizedSearch.length),
            index
        })
        index = normalizedContent.indexOf(normalizedSearch, index + normalizedSearch.length)
    }

    return candidates
}

function collectPrefixedCandidates(content: string, originalSearch: string, search: string) {
    if (search === originalSearch || !search) return []
    return collectOccurrences(content, search)
}

function collectLineBlockCandidates(
    content: string,
    search: string,
    compare: (contentLine: string, searchLine: string) => boolean
) {
    const contentLines = content.split('\n')
    const searchLines = search.split('\n')
    if (searchLines.length === 0 || searchLines.length > contentLines.length) return []

    const lineStarts = getLineStarts(contentLines)
    const candidates: IEditMatchCandidate[] = []

    for (let startLine = 0; startLine <= contentLines.length - searchLines.length; startLine++) {
        const matched = searchLines.every((searchLine, index) =>
            compare(contentLines[startLine + index] ?? '', searchLine)
        )
        if (!matched) continue

        const endLine = startLine + searchLines.length - 1
        const start = lineStarts[startLine] ?? 0
        const end = (lineStarts[endLine] ?? 0) + (contentLines[endLine]?.length ?? 0)
        candidates.push({ value: content.slice(start, end), index: start })
    }

    return candidates
}

function collectBlockAnchorCandidates(content: string, search: string) {
    const contentLines = content.split('\n')
    const searchLines = search.split('\n')
    if (searchLines.length < 2 || searchLines.length > contentLines.length) return []

    const firstLine = (searchLines[0] ?? '').trim()
    const lastLine = (searchLines.at(-1) ?? '').trim()
    const middleLines = searchLines.slice(1, -1)
    const lineStarts = getLineStarts(contentLines)
    const candidates: IEditMatchCandidate[] = []

    for (let startLine = 0; startLine <= contentLines.length - searchLines.length; startLine++) {
        if ((contentLines[startLine] ?? '').trim() !== firstLine) continue

        const endLine = startLine + searchLines.length - 1
        if ((contentLines[endLine] ?? '').trim() !== lastLine) continue

        const matchedCount = middleLines.reduce((count, line, index) => {
            const contentLine = (contentLines[startLine + 1 + index] ?? '').trim()
            return contentLine === line.trim() ? count + 1 : count
        }, 0)
        if (
            middleLines.length > 0 &&
            matchedCount / middleLines.length < BLOCK_ANCHOR_MIN_SIMILARITY
        ) {
            continue
        }

        const start = lineStarts[startLine] ?? 0
        const end = (lineStarts[endLine] ?? 0) + (contentLines[endLine]?.length ?? 0)
        candidates.push({ value: content.slice(start, end), index: start })
    }

    return candidates
}

function getLineStarts(lines: string[]) {
    const starts: number[] = []
    let offset = 0

    for (const line of lines) {
        starts.push(offset)
        offset += line.length + 1
    }

    return starts
}

function stripLineNumberPrefix(value: string) {
    return value
        .split('\n')
        .map((line) => line.replace(LINE_NUMBER_PREFIX_PATTERN, ''))
        .join('\n')
}

function normalizeQuotes(value: string) {
    return value
        .replaceAll(LEFT_SINGLE_CURLY_QUOTE, "'")
        .replaceAll(RIGHT_SINGLE_CURLY_QUOTE, "'")
        .replaceAll(LEFT_DOUBLE_CURLY_QUOTE, '"')
        .replaceAll(RIGHT_DOUBLE_CURLY_QUOTE, '"')
}

function unescapeVisibleCharacters(value: string) {
    return value
        .replaceAll('\\r\\n', '\n')
        .replaceAll('\\n', '\n')
        .replaceAll('\\r', '\r')
        .replaceAll('\\t', '\t')
}

function unescapeUnicode(value: string) {
    return value.replaceAll(UNICODE_ESCAPE_PATTERN, (match: string, ...args: unknown[]) => {
        const groups = args.at(-1) as { hex?: string } | undefined
        const hex = groups?.hex
        return hex ? String.fromCharCode(Number.parseInt(hex, 16)) : match
    })
}

function applyCurlyDoubleQuotes(value: string) {
    return [...value]
        .map((char, index, chars) => {
            if (char !== '"') return char
            return isOpeningQuoteContext(chars, index)
                ? LEFT_DOUBLE_CURLY_QUOTE
                : RIGHT_DOUBLE_CURLY_QUOTE
        })
        .join('')
}

function applyCurlySingleQuotes(value: string) {
    return [...value]
        .map((char, index, chars) => {
            if (char !== "'") return char

            const previous = chars[index - 1]
            const next = chars[index + 1]
            if (isLetter(previous) && isLetter(next)) return RIGHT_SINGLE_CURLY_QUOTE

            return isOpeningQuoteContext(chars, index)
                ? LEFT_SINGLE_CURLY_QUOTE
                : RIGHT_SINGLE_CURLY_QUOTE
        })
        .join('')
}

function isOpeningQuoteContext(chars: string[], index: number) {
    if (index === 0) return true

    const previous = chars[index - 1]
    return (
        previous === ' ' ||
        previous === '\t' ||
        previous === '\n' ||
        previous === '\r' ||
        previous === '(' ||
        previous === '[' ||
        previous === '{' ||
        previous === '—' ||
        previous === '–'
    )
}

function isLetter(char: string | undefined) {
    return char !== undefined && LETTER_PATTERN.test(char)
}
