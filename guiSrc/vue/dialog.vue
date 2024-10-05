<script setup>
import { Settings, Progress, SubProgress, FileTable } from '@/js/globalState/globalState.js'
import { transDialogShow } from '@/js/globalState/globalState.js'
import ControlLine from '@/vue/control/controlLine.vue'

const settings = Settings()
const progress = Progress()
const subProgress = SubProgress()
const fileTable = FileTable()

function openLink (url) {
    wsClient.send('openLink', url)
}

function checkTrans () {
    let handle = wsClient.invoke('checkTrans', null)
    handle.onEnd((message) => {
        if (message.data) {
            showElMessage.success('API测试有效！')
        } else {
            showElMessage.warning('API测试无效！')
        }
    })
}

function endScraper () {
    subProgress.button = '正在取消'
    subProgress.buttonDisabled = true
    wsClient.send('endScrap', null)
}


</script>

<template>
    <!--    翻译配置对话框-->
    <el-dialog v-model="transDialogShow"
               class="dialog"
               width="500"
               :show-close="false"
               :close-on-press-escape="false"
               style="border-radius: 6px;">
        <template #footer>
            <div class="dialog-footer">
                <div>
                    <el-button @click="checkTrans()" round plain>测试</el-button>
                    <el-link v-if="settings.trans_engine==='腾讯翻译'"
                             type="primary"
                             style="margin-left: 1em"
                             @click="openLink('https://cloud.tencent.com/product/tmt')">
                        申请腾讯翻译api
                    </el-link>
                    <el-link v-if="settings.trans_engine==='百度翻译'"
                             type="primary"
                             style="margin-left: 1em"
                             @click="openLink('https://api.fanyi.baidu.com/product/11')">
                        申请百度翻译api
                    </el-link>
                </div>
                <el-button @click="transDialogShow = false" type="primary" round plain>关闭</el-button>
            </div>
        </template>

        <div class="dialog-body" style="flex-direction: column;">
            <control-line label="id" right-width="20rem">
                <el-input v-if="settings.trans_engine==='腾讯翻译'" v-model="settings.trans_tencent_id"
                          size="small"></el-input>
                <el-input v-if="settings.trans_engine==='百度翻译'" v-model="settings.trans_baidu_id"
                          size="small"></el-input>
            </control-line>
            <control-line label="key" right-width="20rem">
                <el-input v-if="settings.trans_engine==='腾讯翻译'" v-model="settings.trans_tencent_key"
                          size="small"></el-input>
                <el-input v-if="settings.trans_engine==='百度翻译'" v-model="settings.trans_baidu_key"
                          size="small"></el-input>
            </control-line>
        </div>

    </el-dialog>

    <!--    编辑番号对话框-->
    <el-dialog v-model="fileTable.showEditNum"
               class="dialog"
               width="300"
               :show-close="false"
               style="border-radius: 6px">
        <div class="dialog-body" style="flex-direction: column;">
            <control-line label="番号">
                <el-input  v-model="fileTable.currentEditNum" spellcheck="false" size="small"></el-input>
            </control-line>
            <control-line label="后缀">
                <el-checkbox-group v-model="fileTable.currentEditSuffix"  size="small">
                    <el-checkbox-button  key="C" value="C">-C</el-checkbox-button>
                    <el-checkbox-button  key="U" value="U">-U</el-checkbox-button>
                </el-checkbox-group>
            </control-line>
        </div>
        <template #footer>
            <div class="dialog-footer">
                <el-button @click="fileTable.showEditNum = false" round plain>关闭</el-button>
                <el-button @click="fileTable.editNum()" type="primary" round plain>确定</el-button>
            </div>
        </template>
    </el-dialog>

    <!--    刮削进度对话框-->
    <el-dialog v-model="progress.dialogShow"
               class="dialog"
               width="500"
               :show-close="false"
               :close-on-press-escape="false"
               :close-on-click-modal="false"
               style="border-radius: 6px">
        <div class="dialog-body">
            <div class="center-vertically">
                <span style="font-weight: bold">总进度</span>
                <el-progress type="circle"
                             :percentage="progress.getPercent"
                             :duration="10"
                             :stroke-width="10"
                             :show-text="false"
                             style="margin:1em 0 2em 0"/>
                <span>{{ progress.current }} / {{ progress.total }}</span>
            </div>
            <div class="center-vertically">
                <span style="font-weight: bold">单个进度</span>
                <el-progress type="circle"
                             :percentage="subProgress.getPercent"
                             :duration="10"
                             :stroke-width="10"
                             :show-text="false"
                             style="margin: 1em 0 2em 0"/>
                <span>正在{{ subProgress.getText }}...</span>
            </div>
        </div>
        <template #footer>
            <div class="dialog-footer" style="justify-content: center;margin-top: 1em">
                <el-button @click="endScraper()" :disabled="subProgress.buttonDisabled" round plain>
                    {{ subProgress.button }}
                </el-button>
            </div>
        </template>
    </el-dialog>
</template>

<style scoped>
.dialog-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 2em;
    margin-bottom: .5em;

    & button {
        height: 20px;
    }
}

.dialog-body {
    padding: 0 2em 0 2.5em;
    display: flex;
    justify-content: space-around;
}

.center-vertically {
    display: flex;
    flex-direction: column;
    align-items: center;
}

span {
    font-size: var(--font-size);
}
</style>