import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import svgLoader from 'vite-svg-loader'

export default defineConfig({
	main: {
		plugins: [externalizeDepsPlugin()]
	},
	preload: {
		plugins: [externalizeDepsPlugin()]
	},
	renderer: {
		plugins: [vue(), svgLoader()],
		build: {
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
						// 将组件文件打包到独立的chunk
						if (id.includes('src/renderer/src/components')) {
							return 'components'
						}
						// 将样式文件打包到独立的chunk
						if (id.includes('src/renderer/src/style')) {
							return 'styles'
						}
						// 将繁简转换增强模块打包到独立的chunk
						if (
							id.includes('node_modules') &&
							id.includes('chinese-simple2traditional')
						) {
							return 'chinese-simple2traditional'
						}
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
