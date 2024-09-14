<script setup>
import { Settings, FileTable, Scraper, Progress, SubProgress } from '@/js/globalState/globalState.js'
import { fileTableRef } from '@/js/globalState/fileTable.js'
import zhCn from 'element-plus/dist/locale/zh-cn.mjs'
import { Plus, Delete, Select, CloseBold } from '@element-plus/icons-vue'
import Tooltip from '@/vue/control/tooltip.vue'

const fileTable = FileTable()
const scraper = Scraper()
const progress = Progress()
const subProgress = SubProgress()

const fileExtension = {
    mp4: '#7862DA',
    mkv: '#3BBFCD',
    mov: '#C562D9',
    avi: '#D97362',
    vob: '#B2AAD9',
    flv: '#B4D962',
    ts: '#D9CB62',
    webm: '#62D9A5',
    wmv: '#628BD9'
}

//文件选择对话框按钮
function selectFile () {
    let options = {
        properties: ['openFile', 'multiSelections', 'dontAddToRecent'],
        filters: [
            { name: 'Video Files', extensions: Object.keys(fileExtension) }
        ]
    }
    let handle = wsClient.invoke('showOpenDialog', options)
    handle.onRespond((message) => {
        addFiles(message.data)
    })
}

function dropFile (e) {
    e.preventDefault()
    const data = Array.from(e.dataTransfer.files)
        .filter(file => file.type.startsWith('video'))
        .map((file) => {
            return {
                name: file.name,
                path: file.path,
                size: file.size,
                basename: file.name.replace(/\.[^/.]+$/, '')
            }
        })

    if (data.length > 0) {
        addFiles(data)
    }
}

//文件列表改变选中
function selectionChange (selection) {
    fileTable.updateSelectedFiles(selection)
}

//开始刮削按钮
function run () {
    let files = fileTable.selectedFiles
    files = files.filter(file => !file.state) //忽略已完成的

    if (files.length === 0) {
        showElMessage.warning('请添加要刮削的文件')
        return
    }

    progress.begin(files.length) //弹出进度对话框
    subProgress.begin()

    let handle = wsClient.invoke('beginScrap', {
        files: files,
        type: scraper.currentScraper,
        outputPath: scraper.getCurrentScraperOutputPath
    })
    handle.onRespond((message) => {
        //判断是否取消刮削
        if (message.data === 'end') {
            progress.end()
            window.showElMessage.error('刮削已取消')
            return
        }

        if ('type' in message.data) {
            //单个步骤
            subProgress.update(message.data.text)
        } else {
            let path = message.data.filePath
            let state = message.data.state
            subProgress.begin()
            progress.update()

            fileTable.updateState(path, state)
        }
    })
}

/**
 * @param {{}} files
 */
async function addFiles (files) {
    //忽略已在列表中的文件
    let repeat = 0
    files = files.filter(file => {
        if (!fileTable.scrapingTable.some(e => e.path === file.path)) {
            return true
        } else {
            repeat++
            return false
        }
    })

    if (repeat > 0) {
        console.log('文件重复导入')
        showElMessage.warning(repeat + ' 个文件重复导入')
    }
    if (files.length === 0) return

    files.forEach((file) => {
        fileTable.scrapingTable_add(file)
    })
}
</script>

<template>
    <div class="table-container" @drop="dropFile" @dragover.prevent>
        <el-config-provider :locale="zhCn">
            <div class="table-container-top">
                <div>
                    <tooltip text="清空">
                        <el-button @click="fileTable.scrapingTable_clear()" type="primary" size="small" :icon="Delete"
                                   circle plain/>
                    </tooltip>
                    <tooltip text="添加文件">
                        <el-button @click="selectFile()" type="primary" size="small" :icon="Plus" plain circle/>
                    </tooltip>
                </div>
                <div style="display: flex">
                    <tooltip text="选择刮削器">
                        <el-select
                            v-model="scraper.currentScraper"
                            placeholder="Select"
                            style="width: 120px;margin-right: 20px"
                        >
                            <el-option
                                v-for="item in scraper.ScraperList"
                                :key="item.value"
                                :label="item.value"
                                :value="item.value"
                            />
                        </el-select>
                    </tooltip>
                    <div>
                        <el-button @click="run()" style="width: 80px" type="primary" round>刮削</el-button>
                    </div>
                </div>
            </div>

            <el-table class="video-table"
                      ref="fileTableRef"
                      :data="fileTable.scrapingTable"
                      height="calc(100vh - 7rem)"
                      @selection-change="selectionChange"
            >
                <el-table-column type="selection" width="50"/>
                <el-table-column prop="jav" label="番号" align="center" width="130"></el-table-column>
                <el-table-column prop="name" label="文件名" min-width="250"></el-table-column>
                <el-table-column prop="size" label="大小" align="center" width="100"></el-table-column>
                <el-table-column label="状态" align="center" width="80">
                    <template #default="scope">
                        <el-icon v-if="scope.row.state"><Select/></el-icon>
                        <el-icon v-if="!scope.row.state">
                            <CloseBold/>
                        </el-icon>
                    </template>
                </el-table-column>
            </el-table>
        </el-config-provider>
    </div>
</template>

<style scoped>
.el-table {
    --el-table-header-bg-color: var(--color-secondary);
    --el-table-header-text-color: var(--color-text-secondary);
    --el-table-text-color: var(--color-text-secondary-light);
    --el-table-tr-bg-color: var(--color-primary);
    --el-table-border-color: var(--color-secondary);
    --el-table-expanded-cell-bg-color: transparent;
}

.table-container {
    width: 100%;
    border-right: 1px solid var(--el-border-color);

    & .table-container-top {
        height: 5rem;
        padding: 0 2rem;
        display: flex;
        justify-content: space-between;
        align-items: center;
        background-color: var(--color-secondary-light);
    }

    & .video-table {
        background-color: var(--color-primary);

        & :deep(.cell) {
            white-space: nowrap;
        }

        & .item-icon {
            width: 2.5em;
            height: 2.5em;
            margin: .5em .75em .5em 0;
        }

        & .item-name {
            color: var(--color-text-secondary);
            font-weight: bold;
        }

        & .item-info {
            display: flex;
            font-size: 11px;
            color: #A8ABB2;
            line-height: 1em;
            margin-top: .5em
        }

        & :deep(.el-checkbox) {
            transform: translateX(.8em)
        }

        & :deep(.el-checkbox__inner) {
            background-color: var(--color-primary);
            border-color: var(--el-color-primary-light-7);
        }

        & :deep(.el-checkbox__input.is-checked) .el-checkbox__inner, & :deep(.el-checkbox__input.is-indeterminate) .el-checkbox__inner {
            background-color: var(--el-color-primary-light-5);
            border-color: var(--el-color-primary-light-5);
        }

        & :deep(.el-table__cell) {
            transition: background-color .1s ease !important;
        }
    }
}


</style>