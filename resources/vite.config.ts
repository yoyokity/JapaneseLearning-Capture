import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import neutralino from 'vite-plugin-neutralino'
import svgLoader from 'vite-svg-loader'

// https://vite.dev/config/
export default defineConfig({
    server: {
        port: 3157
    },
    plugins: [
        vue(),
        vueDevTools(),
        neutralino({
            rootPath: '../'
        }),
        svgLoader()
    ],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url))
        }
    }
})
