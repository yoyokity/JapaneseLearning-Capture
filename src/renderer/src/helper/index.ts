export * from './const.ts'
export * from './DataHelper.ts'
export * from './DebugHelper.ts'
export * from './EncodeHelper.ts'
export * from './ImageHelper.ts'
export * from './LogHelper.ts'
export * from './NetHelper.ts'
export * from './PathHelper.ts'
export * from './TaskHelper.ts'
export * from './TransHelper.ts'

/**
 * 判断是否为有效的URL
 */
export function isUrl(url: string) {
    try {
        void new URL(url)
        return true
    } catch {
        return false
    }
}

/**
 * 验证字符串是否为数字或带小数的数字
 * @param str - 需要验证的字符串
 * @param [allowDecimal] - 是否允许小数点
 */
export const isNumeric = (str: string, allowDecimal: boolean = true): boolean => {
    if (typeof str != 'string' || str.trim() === '') {
        return false
    }

    if (!allowDecimal && str.includes('.')) {
        return false
    }

    return !Number.isNaN(Number(str)) && !Number.isNaN(Number.parseFloat(str))
}

/**
 * 验证字符串是否为有效的 YYYY-MM-DD 格式日期
 * @param dateString - 需要验证的日期字符串
 * @returns boolean
 */
export const isValidDate = (dateString: string): boolean => {
    // 步骤1: 验证格式
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(dateString)) {
        return false
    }

    // 步骤2: 验证日期有效性
    const date = new Date(dateString)
    const [year, month, day] = dateString.split('-')

    // 使用 !isNaN() 确保 Date 对象成功创建
    // 然后比对创建的 Date 对象的年、月、日是否和传入的一致
    // 注意：getMonth() 返回 0-11，所以需要 +1
    return (
        !Number.isNaN(date.getTime()) &&
        date.getFullYear().toString() === year &&
        (date.getMonth() + 1).toString().padStart(2, '0') === month &&
        date.getDate().toString().padStart(2, '0') === day
    )
}
