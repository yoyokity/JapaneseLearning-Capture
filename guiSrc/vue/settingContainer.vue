<script setup>
import Card from '@/vue/control/card.vue'
import ControlLine from '@/vue/control/controlLine.vue'
import { Scraper, Settings } from '@/js/globalState/globalState.js'
import { transDialogShow } from '@/js/globalState/globalState.js'

const scraper = Scraper()
const settings = Settings()

settings.$subscribe((mutation, state) => {
    settings.sendWS()
})

function format_proxy_port (value) {
    if (isNaN(Number(value)) || Number(value) <= 0) {
        return '7890'
    }
    return value
}
</script>

<template>
    <el-scrollbar style="width: 100%;"
                  view-style="display: flex;flex-direction: column;align-items: center;padding-bottom: 3rem;"
                  :always="true">
        <card label="输出路径"
              tooltip="为每个刮削器设置单独的输出路径，如果不使用绝对路径，则在应用程序根目录下建立相对路径文件夹">
            <control-line :label="item.label" v-for="item in scraper.ScraperList">
                <el-input v-model="item.output" size="small" spellcheck="false"></el-input>
            </control-line>
        </card>
        <card label="通用">
            <control-line label="连接间隔(s)" tooltip="访问页面时的间隔，太低可能会被反爬虫">
                <el-input-number v-model="settings.connection_delay" size="small"
                                 :min="1" :max="60"></el-input-number>
            </control-line>
            <control-line label="连接超时(s)" tooltip="超过该时间判定本次连接失败">
                <el-input-number v-model="settings.connection_timeout" size="small"
                                 :min="3" :max="60"></el-input-number>
            </control-line>
            <control-line label="重连次数" tooltip="失败后尝试重连的次数">
                <el-input-number v-model="settings.connection_retry" size="small"
                                 :min="0" :max="20"></el-input-number>
            </control-line>
        </card>

        <card label="代理">
            <control-line label="启用">
                <el-switch v-model="settings.proxy"></el-switch>
            </control-line>
            <control-line label="主机">
                <el-input v-model="settings.proxy_ip" size="small"></el-input>
            </control-line>
            <control-line label="端口">
                <el-input v-model="settings.proxy_port" size="small"
                          :formatter="format_proxy_port"></el-input>
            </control-line>
        </card>

        <card label="翻译" tooltip="google翻译不需要配置自己的api，腾讯翻译和百度翻译需要">
            <control-line label="启用">
                <el-switch v-model="settings.trans"></el-switch>
            </control-line>
            <control-line label="引擎">
                <el-select v-model="settings.trans_engine" size="small">
                    <el-option v-for="item in settings.getTransEngineList" :key="item" :label="item" :value="item"/>
                </el-select>
            </control-line>
            <control-line label="目标语言">
                <el-select v-model="settings.trans_language" size="small">
                    <el-option v-for="item in settings.getTransLangList" :key="item" :label="item" :value="item"/>
                </el-select>
            </control-line>
            <control-line v-if="settings.trans_engine !== 'google'" label="API">
                <el-button type="primary" @click="transDialogShow = true" round plain>配置</el-button>
            </control-line>
        </card>
    </el-scrollbar>
</template>

<style scoped>
.setting-container {
    display: flex;
    flex-direction: column;
    align-items: center;
}
</style>