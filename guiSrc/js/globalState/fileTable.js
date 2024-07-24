import { defineStore } from 'pinia'

/**
 * 获取文件大小的格式化字符串
 * @protected
 * @param {number} size 文件大小
 * @returns {string}
 */
function getSize (size) {
    if (!isNaN(size)) {
        //kb
        size = size / 1024
        if (size < 1024) {
            return size.toFixed(0) + ' KB'
        }

        //mb
        size = size / 1024
        if (size < 1024) {
            return size.toFixed(0) + ' MB'
        }

        //gb
        size = size / 1024
        return size.toFixed(1) + ' GB'
    }
    return '0 KB'
}

/**
 * 解析番号
 * @param {string} fileName
 * @return {{javNumber: string, uncensored: boolean, subtitle: boolean, longJavNumber: string}} [番号,无码,字幕,完整番号]
 */
function getJavNumber (fileName) {
    let javNumber = null
    let uncensored = false
    let subtitle = false

    const match = fileName.match(/[a-zA-Z]+-[0-9]+(-[UuCc]+)?/)
    if (match) {
        javNumber = match[0].toUpperCase()
    }

    let longJavNumber = javNumber

    if (javNumber !== null) {
        if (javNumber.endsWith('-U')) {
            uncensored = true
            javNumber = javNumber.replace('-U', '')
        }
        if (javNumber.endsWith('-C')) {
            subtitle = true
            javNumber = javNumber.replace('-C', '')
        }
        if (javNumber.endsWith('-UC') || javNumber.endsWith('-CU')) {
            uncensored = true
            subtitle = true
            javNumber = javNumber.replace('-UC', '').replace('-CU', '')
        }
    } else {
        javNumber = fileName
        longJavNumber = fileName
    }

    return {
        javNumber: javNumber.trim(),
        uncensored: uncensored,
        subtitle: subtitle,
        longJavNumber: longJavNumber.trim()
    }
}

export const FileTable = defineStore('fileTable', {
    state: () => ({
        scrapingTable: [],
    }),
    actions: {
        /**
         * 添加文件到scrapingTable
         */
        scrapingTable_add (file) {
            file.size = getSize(file.size)
            let jav = getJavNumber(file.basename)
            file.jav = jav.javNumber
            file.uncensored = jav.uncensored
            file.subtitle = jav.subtitle
            file.longJavNumber = jav.longJavNumber
            file.state = false
            this.scrapingTable.push(file)
            console.log(file)
        },
        scrapingTable_clear () {
            this.scrapingTable = []
        },
        updateState (path, state) {
            let file = this.scrapingTable.find((item) => item.path === path)
            file.state = state
        }
    },
})