import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import svgLoader from 'vite-svg-loader'
import vueDevTools from 'vite-plugin-vue-devtools'

export default defineConfig({
	main: {
		plugins: [externalizeDepsPlugin()]
	},
	preload: {
		plugins: [externalizeDepsPlugin()]
	},
	renderer: {
		server: {
			port: 5174
		},
		plugins: [vue(), svgLoader(), vueDevTools()],
		build: {
			chunkSizeWarningLimit: 999999,
			minify: 'terser', // 使用 terser 进行代码压缩和混淆
			terserOptions: {
				compress: {
					drop_console: true, // 移除 console
					drop_debugger: true // 移除 debugger
				},
				format: {
					comments: false // 移除注释
				}
			},
			rollupOptions: {
				output: {
					manualChunks: (id) => {
						if (id.includes('node_modules')) {
							if (id.includes('primeuix')) return 'primevue'
							if (id.includes('primevue')) return 'primevue'
							if (id.includes('primeicons')) return 'primevue'
							if (id.includes('chinese-simple2traditional'))
								return 'chinese-simple2traditional'
						}
						return null
					},
					entryFileNames: '[name].js',
					chunkFileNames: '[name].js',
					assetFileNames: '[name].[ext]'
				}
			}
		},
		resolve: {
			alias: {
				'@renderer': resolve('src/renderer/src')
			}
		}
	}
})
