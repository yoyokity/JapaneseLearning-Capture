<script setup>
import { Settings, Progress } from '@/js/globalState/globalState.js'
import { transDialogShow } from '@/js/globalState/globalState.js'
import ControlLine from '@/vue/control/controlLine.vue'

const settings = Settings()
const progress = Progress()

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

        <div class="dialog-body">
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

    <!--    刮削进度对话框-->
    <el-dialog v-model="progress.dialogShow"
               class="dialog"
               width="500"
               :show-close="false"
               :close-on-press-escape="false"
               :close-on-click-modal="false"
               style="border-radius: 6px">
        <div class="dialog-body">
            <div style="font-weight: bold">
                <span style="margin-right: 1em">刮削进度:</span>
                <span>{{ progress.current }} / {{ progress.total }}</span>
            </div>
            <el-progress
                :percentage="progress.getPercent"
                :stroke-width="15"
                :duration="10"
                :show-text="false"
                style="margin-bottom: 1em;margin-top: 1em"
                striped striped-flow/>
        </div>
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
}

span {
    font-size: var(--font-size);
}
</style>